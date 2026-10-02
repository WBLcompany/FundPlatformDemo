-- R-095 · the audit chain must read in id order. The id came from the identity default, which is
-- evaluated before BEFORE triggers — i.e. before the per-tenant lock. Two concurrent writers could
-- take ids 10 and 11, the second chain first, and the first then chain onto it while keeping the
-- lower id: the chain was intact by commit order and broken by id order (seen once the worker ran
-- its file scan beside the outbox). The id is now drawn inside the lock, so id order = chain order.
create or replace function kernel.audit_chain() returns trigger
language plpgsql security definer set search_path = '' as $$
declare last text;
begin
  -- One writer per tenant at a time, so the chain cannot fork.
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text, 42));
  new.id := nextval('kernel.audit_log_id_seq');
  select a.hash into last from kernel.audit_log a where a.tenant_id = new.tenant_id order by a.id desc limit 1;
  new.prev_hash := coalesce(last, 'genesis');
  new.hash := encode(public.digest(
    new.prev_hash || '|' || new.tenant_id::text || '|' || new.at::text || '|' || coalesce(new.actor::text,'') || '|' ||
    new.action || '|' || new.entity_kind || '|' || coalesce(new.entity_id::text,'') || '|' ||
    coalesce(new.before::text,'') || '|' || coalesce(new.after::text,''), 'sha256'), 'hex');
  return new;
end $$;
