export function loadConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer between 1 and 65535.');
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (Boolean(url) !== Boolean(key))
    throw new Error('Configure all or none of: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  return {
    port,
    nodeEnv: env.NODE_ENV || 'development',
    commitSha: env.RENDER_GIT_COMMIT || env.GITHUB_SHA || null,
    persistenceEnabled: Boolean(url && key),
    searchConfigured: Boolean(env.SERPAPI_API_KEY?.trim() && url && key),
  };
}
