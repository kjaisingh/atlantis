export function loadConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer between 1 and 65535.');
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (Boolean(url) !== Boolean(key))
    throw new Error('Configure all or none of: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  const appUrl = env.APP_URL?.trim();
  if (appUrl) {
    const parsed = new URL(appUrl);
    if (
      parsed.protocol !== 'https:' &&
      !(env.NODE_ENV === 'test' && parsed.hostname === 'localhost')
    )
      throw new Error('APP_URL must use HTTPS.');
    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== '/'
    )
      throw new Error('APP_URL must be an origin without credentials, path or query.');
  }
  const alertsConfigured = Boolean(
    env.ALERTS_ENABLED === 'true' &&
    env.SERPAPI_API_KEY?.trim() &&
    url &&
    key &&
    env.BREVO_API_KEY?.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ALERT_FROM_EMAIL || '') &&
    appUrl &&
    env.JOB_SECRET?.length >= 32,
  );
  return {
    port,
    alertsConfigured,
    appUrl: appUrl?.replace(/\/$/, ''),
    emailKey: env.BREVO_API_KEY,
    emailFrom: env.ALERT_FROM_EMAIL,
    jobSecret: env.JOB_SECRET,
    nodeEnv: env.NODE_ENV || 'development',
    commitSha: env.RENDER_GIT_COMMIT || env.GITHUB_SHA || null,
    persistenceEnabled: Boolean(url && key),
    searchConfigured: Boolean(env.SERPAPI_API_KEY?.trim() && url && key),
  };
}
