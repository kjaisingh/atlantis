-- Review existing subscriptions before this script assigns their currency to USD.
alter table public.subscriptions
  add column if not exists currency text not null default 'USD';

alter table public.subscriptions
  drop constraint if exists subscriptions_currency_check;

alter table public.subscriptions
  add constraint subscriptions_currency_check check (currency ~ '^[A-Z]{3}$');
