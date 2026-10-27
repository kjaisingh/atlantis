const { ATLANTIS_URL: base, JOB_SECRET: secret } = process.env;
if (!base || !secret)
  throw new Error('Configure ATLANTIS_URL and JOB_SECRET before scheduling alerts.');
let ready = false;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    const response = await fetch(`${base}/api/ready`, { signal: AbortSignal.timeout(60_000) });
    const status = await response.json();
    if (response.ok && status.ready && !status.alerts) {
      console.log('Price alerts are disabled; no checks run.');
      process.exit(0);
    }
    if (response.ok && status.ready && status.alerts) {
      ready = true;
      break;
    }
  } catch {
    /* A sleeping free instance may need another wake-up request. */
  }
}
if (!ready) throw new Error('Flight search or price alerts are not ready.');
for (let batch = 0; batch < 10; batch++) {
  const response = await fetch(`${base}/api/jobs/check-alerts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Alert job failed (${response.status}).`);
  const result = await response.json();
  console.log(JSON.stringify(result));
  if (result.unknown)
    throw new Error('An email delivery could not be confirmed. Automatic resend is disabled.');
  if (!result.more) break;
}
