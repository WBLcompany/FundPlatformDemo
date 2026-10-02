-- T-17 · the worker's restricted login role. It may list tenants and pending
-- (event, consumer) pairs — metadata only — and nothing else. Every event is
-- then processed in a session scoped to that event's tenant (invariant 3).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'wbl_worker') then create role wbl_worker nologin noinherit; end if;
end $$;
grant wbl_worker to authenticator;
grant usage on schema kernel to wbl_worker;

create or replace function kernel.worker_tenants() returns table (id uuid)
language sql stable security definer set search_path = '' as $$
  select d.id from platform.donors d where d.status <> 'suspended'
$$;
revoke all on function kernel.worker_tenants() from public, anon, authenticated;
grant execute on function kernel.worker_tenants() to wbl_worker;
grant execute on function kernel.pending_events(text[], int) to wbl_worker;
