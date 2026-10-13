function optionalGroup(env, names) {
  const values = names.map((name) => env[name]?.trim() ?? '');
  const configured = values.filter(Boolean).length;
  if (configured > 0 && configured < names.length) {
    throw new Error(`Configure all or none of: ${names.join(', ')}`);
  }
  return configured === names.length;
}

export function loadConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const persistenceEnabled = optionalGroup(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const emailEnabled = optionalGroup(env, ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']);
  const subscriptionSchemaReady = env.SUBSCRIPTION_SCHEMA_VERSION === '20261013';

  return {
    port,
    nodeEnv: env.NODE_ENV || 'development',
    commitSha: env.RENDER_GIT_COMMIT || env.GITHUB_SHA || null,
    duffelConfigured: Boolean(env.DUFFEL_API_KEY),
    persistenceEnabled,
    emailEnabled,
    subscriptionSchemaReady,
    subscriptionsEnabled: persistenceEnabled && emailEnabled && subscriptionSchemaReady,
  };
}
