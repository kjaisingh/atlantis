import express from 'express';
import rateLimit from 'express-rate-limit';
import { authorizedJob, validateAlert } from './alerts.js';
import { SearchError } from './errors.js';

export function createAlertRoutes({ config, alerts, airportSet }) {
  const router = express.Router();
  const signupLimit = rateLimit({
    windowMs: 60 * 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many alert requests. Please try again in an hour.' },
  });
  const actionLimit = rateLimit({
    windowMs: 60 * 60_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many alert requests. Please try again in an hour.' },
  });
  router.use('/alerts', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!config.alertsConfigured && !(req.path === '/unsubscribe' && config.persistenceEnabled))
      return res.status(503).json({ error: 'Price alerts are not available yet.' });
    next();
  });
  router.post('/alerts', signupLimit, async (req, res) => {
    const result = validateAlert(req.body || {}, airportSet);
    if (result.error) return res.status(400).json({ error: result.error });
    await alerts.subscribe(result.value);
    res.status(202).json({
      message: 'Check your email to confirm.',
    });
  });
  for (const action of ['verify', 'unsubscribe'])
    router.post(`/alerts/${action}`, actionLimit, async (req, res) => {
      await alerts.action(req.body?.token, action);
      res.json({
        message: action === 'verify' ? 'Alert confirmed.' : 'Alert cancelled.',
      });
    });
  router.post(
    '/jobs/check-alerts',
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many scheduler requests. Please try again in a minute.' },
    }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (!authorizedJob(req.get('Authorization'), config.jobSecret))
        return res.status(401).json({ error: 'Unauthorized.' });
      if (!config.alertsConfigured)
        return res.status(503).json({ error: 'Price alerts are not configured.' });
      res.json(await alerts.check());
    },
  );
  router.use((error, _req, res, _next) => {
    void _next;
    res.status(error instanceof SearchError ? error.status : 503).json({
      error:
        error instanceof SearchError
          ? error.message
          : 'Price alerts are temporarily unavailable. Please try again later.',
    });
  });
  return router;
}
