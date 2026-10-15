import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const persistenceEnabled = Boolean(supabaseUrl && serviceRoleKey);

const supabase = persistenceEnabled
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  : null;

function requireClient() {
  if (!supabase) throw new Error(getConfigError());
  return supabase;
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
  const { data, error } = await requireClient()
    .from('subscriptions')
    .insert(subscription)
    .select('id, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function getPendingSubscriptions() {
  const { data, error } = await requireClient()
    .from('subscriptions')
    .select('*')
    .is('notified_at', null);
  if (error) throw error;
  return data;
}

export async function markNotified(id) {
  const { data, error } = await requireClient()
    .from('subscriptions')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSubscription(id) {
  const { error } = await requireClient().from('subscriptions').delete().eq('id', id);
  if (error) throw error;
}
