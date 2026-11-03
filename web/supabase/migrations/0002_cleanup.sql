-- Deletes personal data once the privacy policy says we stop keeping it:
--   unconfirmed launch signups after 90 days,
--   hashed signup attempts (spam protection) after 30 days,
--   unsubscribe records three years after the unsubscribe.
-- Orders are kept: tax rules need them for six years, so delete those by hand.
-- Apply in the Supabase SQL editor after 0001_init.sql. Safe to run again.

create or replace function cleanup_personal_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  unconfirmed integer;
  attempts integer;
  unsubscribed integer;
begin
  delete from launch_signups
  where confirmed_at is null and unsubscribed_at is null and consented_at < now() - interval '90 days';
  get diagnostics unconfirmed = row_count;

  delete from signup_attempts where at < now() - interval '30 days';
  get diagnostics attempts = row_count;

  delete from launch_signups where unsubscribed_at < now() - interval '3 years';
  get diagnostics unsubscribed = row_count;

  return jsonb_build_object('unconfirmed_signups', unconfirmed, 'signup_attempts', attempts, 'unsubscribed_signups', unsubscribed);
end $$;

revoke all on function cleanup_personal_data() from public, anon, authenticated;

-- Runs it every day at 08:00 UTC. Supabase includes the pg_cron extension;
-- running the schedule again with the same name replaces the old one.
create extension if not exists pg_cron;
select cron.schedule('lumi-cleanup-personal-data', '0 8 * * *', 'select public.cleanup_personal_data()');
