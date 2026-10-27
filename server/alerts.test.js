import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAlerts, validateAlert, hashToken, alertToken, authorizedJob } from './alerts.js';
import { createMailer, DeliveryError } from './email.js';
import { createApp } from './app.js';

const trip = {
  origin: 'JFK',
  destination: 'DTW',
  departureDate: '2099-02-28',
  returnDate: '',
  travelers: 1,
};
const config = {
  appUrl: 'https://example.com',
  jobSecret: 'a'.repeat(40),
  alertsConfigured: true,
  persistenceEnabled: true,
  searchConfigured: true,
};
const fare = {
  price: '100.00',
  currency: 'USD',
  path: 'JFK → DTW',
  airline: 'Example',
  departureTime: '2099-02-28T10:00',
  bookingLink: 'https://www.google.com/travel/flights',
};
function harness({ roundtrip = false, threshold = 150 } = {}) {
  const rows = [1, 2].map((i) => ({
    id: String(i),
    email: `test${i}@example.com`,
    trip: { ...trip, returnDate: roundtrip ? '2099-03-01' : '' },
    threshold,
    delivery_key: `key${i}`,
    state: 'active',
  }));
  const sent = [],
    searches = [],
    finishes = [];
  const store = {
    async claimAlerts(owner) {
      return rows
        .filter((r) => r.state === 'active' && !r.owner)
        .map((r) => {
          r.owner = owner;
          return { ...r };
        });
    },
    async finishAlert(id, owner, outcome) {
      finishes.push({ id, owner, outcome });
      const row = rows.find((r) => r.id === id);
      if (!row || row.owner !== owner || row.state === 'cancelled') return false;
      if (outcome === 'prepare') {
        if (row.state !== 'active') return false;
        row.state = 'sending';
      } else if (outcome === 'checked' || outcome === 'deferred') row.state = 'waiting';
      else row.state = outcome;
      return true;
    },
  };
  const send = async (mail) => {
    sent.push(mail);
  };
  const search = async (...args) => {
    searches.push(args);
    return { itineraries: [fare], meta: { partial: false } };
  };
  return { rows, sent, searches, finishes, store, send, search };
}

test('alert validation normalizes email and rejects unsafe or fractional thresholds', () => {
  const airports = new Set(['JFK', 'DTW']);
  const input = { ...trip, email: ' TEST@Example.com ', priceThreshold: 100 };
  assert.equal(validateAlert(input, airports).value.email, 'test@example.com');
  for (const priceThreshold of [true, '100', NaN, 0, -1, 1.005, 1000001])
    assert(validateAlert({ ...input, priceThreshold }, airports).error);
  for (const email of ['', 'bad', 'a\nb@example.com', []])
    assert(validateAlert({ ...input, email }, airports).error);
});

test('signup stores only token hashes and does not send duplicate confirmations', async () => {
  let saved;
  const sent = [];
  const store = {
    async createAlert(params) {
      if (saved) return null;
      saved = params;
      return { id: params.p_id };
    },
  };
  const alerts = createAlerts({ config, store, send: async (mail) => sent.push(mail) });
  await alerts.subscribe({ trip, email: 'test@example.com', threshold: 200 });
  await alerts.subscribe({ trip, email: 'test@example.com', threshold: 200 });
  assert.equal(sent.length, 1);
  assert.equal(saved.p_verify, hashToken(alertToken(saved.p_id, 'verify', config.jobSecret)));
  assert(sent[0].text.includes('#alert-verify='));
  assert(sent[0].text.includes('#alert-unsubscribe='));
  assert.notEqual(saved.p_verify, alertToken(saved.p_id, 'verify', config.jobSecret));
});

test('verification validates token format and hashes before storage access', async () => {
  let seen;
  const alerts = createAlerts({
    config,
    store: {
      async alertAction(hash, action) {
        seen = { hash, action };
        return true;
      },
    },
  });
  await assert.rejects(alerts.action('bad', 'verify'), (e) => e.status === 400);
  await alerts.action('a'.repeat(64), 'verify');
  assert.deepEqual(seen, { hash: hashToken('a'.repeat(64)), action: 'verify' });
});

test('identical alerts share fares and concurrent jobs cannot duplicate notifications', async () => {
  const h = harness();
  const alerts = createAlerts({ config, ...h });
  await Promise.all([alerts.check(), alerts.check()]);
  assert.equal(h.searches.length, 1);
  assert.equal(h.sent.length, 2);
  assert(h.rows.every((r) => r.state === 'notified'));
  assert.equal((await alerts.check()).checked, 0);
});

test('round-trip target uses both directions and all travelers from original search', async () => {
  const h = harness({ roundtrip: true, threshold: 150 });
  await createAlerts({ config, ...h }).check();
  assert.equal(h.searches.length, 2);
  assert.equal(h.sent.length, 0);
  assert(h.finishes.every((r) => r.outcome === 'checked'));
  const matching = harness({ roundtrip: true, threshold: 200 });
  await createAlerts({ config, ...matching }).check();
  assert.match(matching.sent[0].text, /USD 200.00.*both directions combined/);
});

test('partial or failed checks defer without sending misleading matches', async () => {
  for (const search of [
    async () => ({ itineraries: [fare], meta: { partial: true } }),
    async () => {
      throw Error('quota');
    },
  ]) {
    const h = harness();
    const result = await createAlerts({ config, ...h, search }).check();
    assert.equal(result.deferred, 2);
    assert.equal(h.sent.length, 0);
    assert.equal(result.more, false);
  }
});

test('unsubscribe wins before email preparation', async () => {
  const h = harness();
  const search = async () => {
    h.rows.forEach((r) => {
      r.state = 'cancelled';
    });
    return { itineraries: [fare], meta: {} };
  };
  await createAlerts({ config, ...h, search }).check();
  assert.equal(h.sent.length, 0);
});

test('ambiguous delivery is terminal while known rejection may retry later', async () => {
  for (const ambiguous of [true, false]) {
    const h = harness();
    const summary = await createAlerts({
      config,
      ...h,
      send: async () => {
        throw new DeliveryError(ambiguous);
      },
    }).check();
    assert.equal(summary[ambiguous ? 'unknown' : 'deferred'], 2);
    assert(h.rows.every((r) => r.state === (ambiguous ? 'unknown' : 'rejected')));
  }
});

test('Brevo uses HTTPS and saved idempotency; no implicit retry or secret error leak', async () => {
  let request;
  await createMailer(
    { emailKey: 'private-key', emailFrom: 'sender@example.com' },
    async (url, options) => {
      request = { url, options };
      return Response.json({ messageId: 'ok' }, { status: 201 });
    },
  )({ to: 'test@example.com', subject: 'subject', text: 'text', key: 'unique' });
  assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(JSON.parse(request.options.body).headers.idempotencyKey, 'unique');
  for (const status of [400, 429, 500])
    await assert.rejects(
      createMailer({}, async () =>
        Response.json({ message: 'private provider details' }, { status }),
      )({}),
      (e) => e.ambiguous === status >= 500 && !e.message.includes('private'),
    );
  await assert.rejects(
    createMailer({}, async () => {
      throw Error('socket');
    })({}),
    (e) => e.ambiguous === true,
  );
});

test('scheduler authentication rejects missing and incorrect credentials', () => {
  assert(!authorizedJob(undefined, config.jobSecret));
  assert(!authorizedJob('Bearer wrong', config.jobSecret));
  assert(!authorizedJob('Bearer ', ''));
  assert(authorizedJob(`Bearer ${config.jobSecret}`, config.jobSecret));
});

test('alert APIs gate signup, validate requests, and authenticate scheduled jobs', async () => {
  let subscribed = 0,
    checked = 0;
  const app = createApp({
    config,
    alerts: {
      subscribe: async () => subscribed++,
      action: async () => {},
      check: async () => {
        checked++;
        return { checked: 0, more: false };
      },
    },
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (path, body, auth) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await post('/jobs/check-alerts', {})).status, 401);
    assert.equal(checked, 0);
    assert.equal((await post('/jobs/check-alerts', {}, `Bearer ${config.jobSecret}`)).status, 200);
    assert.equal(
      (await post('/alerts', { ...trip, email: 'test@example.com', priceThreshold: 100 })).status,
      202,
    );
    assert.equal(
      (await post('/alerts', { ...trip, email: 'invalid', priceThreshold: 100 })).status,
      400,
    );
    assert.equal(subscribed, 1);
    config.alertsConfigured = false;
    assert.equal((await post('/alerts/unsubscribe', { token: 'a'.repeat(64) })).status, 200);
    assert.equal(
      (await post('/alerts', { ...trip, email: 'test@example.com', priceThreshold: 100 })).status,
      503,
    );
  } finally {
    config.alertsConfigured = true;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('confirmation rejection releases signup while ambiguous delivery retains its token', async () => {
  for (const ambiguous of [true, false]) {
    let cleaned = false;
    const store = {
      createAlert: async (params) => ({ id: params.p_id }),
      finishAlert: async () => {
        cleaned = true;
      },
    };
    const alerts = createAlerts({
      config,
      store,
      send: async () => {
        throw new DeliveryError(ambiguous);
      },
    });
    await assert.rejects(
      alerts.subscribe({ trip, email: 'test@example.com', threshold: 200 }),
      (e) => e.status === 503,
    );
    assert.equal(cleaned, !ambiguous);
  }
});

test('empty and foreign-currency offers do not trigger USD alerts', async () => {
  const h = harness();
  await createAlerts({
    config,
    ...h,
    search: async () => ({ itineraries: [{ ...fare, currency: 'EUR' }], meta: {} }),
  }).check();
  assert.equal(h.sent.length, 0);
  assert(h.finishes.every((r) => r.outcome === 'checked'));
});
