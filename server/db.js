import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const persistenceEnabled = Boolean(supabaseUrl && serviceRoleKey);

const supabase = persistenceEnabled
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  : null;

/**
 * Subscriptions are a best-effort convenience feature, not core functionality.
 * A flaky or misconfigured Supabase project must never block flight search -
 * every method here degrades to a fallback instead of throwing.
 */
async function safeCall(action, fallback, run) {
  if (!persistenceEnabled) {
    return fallback;
  }
  try {
    return await run();
  } catch (err) {
    console.error(`[db] ${action} failed:`, err.message);
    return fallback;
  }
}

export function isEnabled() {
  return persistenceEnabled;
}

export function getConfigError() {
  if (persistenceEnabled) {
    return null;
  }
  return 'Subscriptions are not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable them.';
}

export async function addSubscription(subscription) {
  return safeCall('addSubscription', null, async () => {
    const { data, error } = await supabase
      .from('subscriptions')
      .insert(subscription)
      .select()
      .single();
    if (error) throw error;
    return data;
  });
}

export async function getPendingSubscriptions() {
  return safeCall('getPendingSubscriptions', [], async () => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .is('notified_at', null);
    if (error) throw error;
    return data;
  });
}

export async function markNotified(id) {
  return safeCall('markNotified', null, async () => {
    const { error } = await supabase
      .from('subscriptions')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  });
}

export async function deleteSubscription(id) {
  return safeCall('deleteSubscription', null, async () => {
    const { error } = await supabase.from('subscriptions').delete().eq('id', id);
    if (error) throw error;
  });
}
