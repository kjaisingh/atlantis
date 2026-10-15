-- Add a read-only internal heartbeat without changing subscription data.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'atlantis-keepalive';
select cron.schedule('atlantis-keepalive', '17 3 */3 * *', $$ select count(*) from public.subscriptions $$);
