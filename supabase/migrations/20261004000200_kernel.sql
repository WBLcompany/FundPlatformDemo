-- T-16 · T-17 · kernel: append-only audit log with a per-tenant hash chain (R-095),
-- the transactional outbox and exactly-once delivery record (R-096), activity,
-- notifications, files, holidays.

-- ── Audit log ────────────────────────────────────────────────────────────────
create table kernel.audit_log (
  tenant_id uuid not null references platform.donors(id),
  id bigint generated always as identity,
  at timestamptz not null default clock_timestamp(),
  actor uuid,                        -- person id; null = system/worker
  actor_role text,
  action text not null,              -- insert|update|delete|<domain verb>
  entity_kind text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  prev_hash text not null,
  hash text not null,
  primary key (tenant_id, id)
);

-- Restricted columns never enter the log in clear (national ids, IBANs).
create or replace function kernel.redact(j jsonb) returns jsonb language sql immutable as $$
  select case when j is null then null else
    j - array['iban_enc','national_id_enc','secret_enc','code_hash','password_hash'] end
$$;

create or replace function kernel.audit_chain() returns trigger
language plpgsql security definer set search_path = '' as $$
declare last text;
begin
  -- One writer per tenant at a time, so the chain cannot fork.
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text, 42));
  select a.hash into last from kernel.audit_log a where a.tenant_id = new.tenant_id order by a.id desc limit 1;
  new.prev_hash := coalesce(last, 'genesis');
  new.hash := encode(public.digest(
    new.prev_hash || '|' || new.tenant_id::text || '|' || new.at::text || '|' || coalesce(new.actor::text,'') || '|' ||
    new.action || '|' || new.entity_kind || '|' || coalesce(new.entity_id::text,'') || '|' ||
    coalesce(new.before::text,'') || '|' || coalesce(new.after::text,''), 'sha256'), 'hex');
  return new;
end $$;
create trigger audit_chain before insert on kernel.audit_log for each row execute function kernel.audit_chain();

create or replace function kernel.audit_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit log is append-only (R-095)' using errcode = 'insufficient_privilege';
end $$;
create trigger audit_no_update before update or delete or truncate on kernel.audit_log
  for each statement execute function kernel.audit_immutable();

alter table kernel.audit_log enable row level security;
create policy audit_read on kernel.audit_log for select to authenticated
  using (tenant_id = (select app.tenant()) and (select app.has_any(array['system_admin','executive','grants_manager'])));
-- Inserts come only from kernel.audit_row() (security definer) and kernel.record().
revoke all on kernel.audit_log from public, anon, authenticated;
grant select on kernel.audit_log to authenticated;

-- Verifies the chain for one tenant: returns the first broken id, or null if intact.
create or replace function kernel.verify_audit_chain(p_tenant uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare r record; prev text := 'genesis'; h text;
begin
  for r in select * from kernel.audit_log where tenant_id = p_tenant order by id loop
    h := encode(public.digest(
      prev || '|' || r.tenant_id::text || '|' || r.at::text || '|' || coalesce(r.actor::text,'') || '|' ||
      r.action || '|' || r.entity_kind || '|' || coalesce(r.entity_id::text,'') || '|' ||
      coalesce(r.before::text,'') || '|' || coalesce(r.after::text,''), 'sha256'), 'hex');
    if r.prev_hash <> prev or r.hash <> h then return r.id; end if;
    prev := r.hash;
  end loop;
  return null;
end $$;

-- Generic row trigger for business tables.
create or replace function kernel.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t uuid; e uuid; b jsonb; a jsonb; rid text;
begin
  if tg_op = 'DELETE' then t := old.tenant_id; rid := to_jsonb(old) ->> 'id'; b := kernel.redact(to_jsonb(old));
  elsif tg_op = 'UPDATE' then t := new.tenant_id; rid := to_jsonb(new) ->> 'id'; b := kernel.redact(to_jsonb(old)); a := kernel.redact(to_jsonb(new));
    if b = a then return new; end if;
  else t := new.tenant_id; rid := to_jsonb(new) ->> 'id'; a := kernel.redact(to_jsonb(new)); end if;
  -- Ledger rows have bigint ids; only uuid ids are entity references.
  if rid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then e := rid::uuid; end if;
  insert into kernel.audit_log (tenant_id, actor, actor_role, action, entity_kind, entity_id, before, after)
  values (t, auth.uid(), auth.jwt() ->> 'role', lower(tg_op), tg_table_schema || '.' || tg_table_name, e, b, a);
  return coalesce(new, old);
end $$;

-- ── Outbox ───────────────────────────────────────────────────────────────────
create table kernel.outbox (
  tenant_id uuid not null references platform.donors(id),
  id bigint generated always as identity,
  event_type text not null,
  entity_kind text,
  entity_id uuid,
  actor uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  available_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, id)
);
create index outbox_available_idx on kernel.outbox (available_at, id);

-- One row per (event, consumer): the unique key IS the exactly-once guarantee.
create table kernel.outbox_deliveries (
  tenant_id uuid not null,
  event_id bigint not null,
  consumer text not null,
  delivered_at timestamptz not null default now(),
  attempts int not null default 1,
  last_error text,
  primary key (tenant_id, event_id, consumer),
  foreign key (tenant_id, event_id) references kernel.outbox (tenant_id, id)
);

alter table kernel.outbox enable row level security;
alter table kernel.outbox_deliveries enable row level security;
create policy outbox_insert on kernel.outbox for insert to authenticated with check (tenant_id = (select app.tenant()));
create policy outbox_read on kernel.outbox for select to authenticated using (tenant_id = (select app.tenant()) and (select app.is_system()));
create policy deliveries_rw on kernel.outbox_deliveries for all to authenticated
  using (tenant_id = (select app.tenant()) and (select app.is_system()))
  with check (tenant_id = (select app.tenant()) and (select app.is_system()));
grant select, insert on kernel.outbox to authenticated;
grant select, insert, update on kernel.outbox_deliveries to authenticated;
grant insert on kernel.outbox to anon;
create policy outbox_insert_anon on kernel.outbox for insert to anon with check (tenant_id = (select app.tenant()));

-- The worker's only cross-tenant read: pending (event, consumer) pairs, metadata only.
-- It then processes each one inside a session scoped to that event's tenant.
create or replace function kernel.pending_events(p_consumers text[], p_limit int default 50)
returns table (tenant_id uuid, event_id bigint, event_type text, consumer text)
language sql stable security definer set search_path = '' as $$
  select o.tenant_id, o.id, o.event_type, c.consumer
  from kernel.outbox o
  cross join unnest(p_consumers) as c(consumer)
  where o.available_at <= now()
    and not exists (select 1 from kernel.outbox_deliveries d where d.tenant_id = o.tenant_id and d.event_id = o.id and d.consumer = c.consumer)
  order by o.id
  limit p_limit
$$;
revoke all on function kernel.pending_events(text[], int) from public, anon, authenticated;

-- ── Activity (R-096): readable timeline rows, written by the worker from events.
create table kernel.activity (
  tenant_id uuid not null references platform.donors(id),
  id bigint generated always as identity,
  entity_kind text not null,
  entity_id uuid not null,
  actor uuid,
  actor_label text,
  text_key text not null,
  params jsonb not null default '{}'::jsonb,
  ai boolean not null default false,
  at timestamptz not null default now(),
  event_id bigint,
  primary key (tenant_id, id),
  unique (tenant_id, event_id, entity_kind, entity_id)
);
create index activity_entity_idx on kernel.activity (tenant_id, entity_kind, entity_id, at desc);
alter table kernel.activity enable row level security;
create policy activity_read on kernel.activity for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_staff()) or (params ->> 'org_id')::uuid = any(coalesce((select app.org_ids()), '{}'))));
create policy activity_write on kernel.activity for insert to authenticated with check (tenant_id = (select app.tenant()) and (select app.is_system()));
grant select, insert on kernel.activity to authenticated;

-- ── Notifications (R-102, R-094) ─────────────────────────────────────────────
create table kernel.notifications (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  recipient_person uuid references iam.persons(id),
  recipient_address text,            -- official email / phone when there is no person
  channel text not null check (channel in ('in_app','email','whatsapp','sms')),
  template text not null,
  params jsonb not null default '{}'::jsonb,
  official boolean not null default false,   -- R-094: copy to the association's official email
  status text not null default 'pending' check (status in ('pending','sent','failed','read')),
  event_id bigint,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  primary key (tenant_id, id),
  unique (tenant_id, event_id, channel, recipient_person, recipient_address)
);
alter table kernel.notifications enable row level security;
create policy notifications_read on kernel.notifications for select to authenticated using (
  tenant_id = (select app.tenant()) and (recipient_person = auth.uid() or (select app.is_system())));
create policy notifications_mark_read on kernel.notifications for update to authenticated
  using (tenant_id = (select app.tenant()) and (recipient_person = auth.uid() or (select app.is_system())))
  with check (tenant_id = (select app.tenant()));
create policy notifications_write on kernel.notifications for insert to authenticated with check (tenant_id = (select app.tenant()) and (select app.is_system()));
grant select, insert, update (status, read_at, sent_at) on kernel.notifications to authenticated;

-- ── Files (quarantine → scan → tenant path) ─────────────────────────────────
create table kernel.files (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  storage_path text not null,
  name text not null,
  mime text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null,
  scan_status text not null default 'quarantine' check (scan_status in ('quarantine','clean','infected')),
  owner_org_id uuid,               -- association/supplier that uploaded it, if any
  uploaded_by uuid,
  text_content text,               -- extracted text for evidence excerpts (data, never instructions)
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  check (storage_path like tenant_id::text || '/%')
);
alter table kernel.files enable row level security;
create policy files_read on kernel.files for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_staff()) or owner_org_id = any(coalesce((select app.org_ids()), '{}'))));
create policy files_insert on kernel.files for insert to authenticated with check (
  tenant_id = (select app.tenant()) and uploaded_by = auth.uid() and scan_status = 'quarantine'
  and ((select app.is_staff()) or owner_org_id = any(coalesce((select app.org_ids()), '{}'))));
create policy files_scan on kernel.files for update to authenticated
  using (tenant_id = (select app.tenant()) and (select app.is_system())) with check (tenant_id = (select app.tenant()));
grant select, insert, update (scan_status, text_content) on kernel.files to authenticated;

-- ── Holidays per tenant (business-day SLA, R-044) ───────────────────────────
create table kernel.holidays (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  day date not null,
  label text not null,
  primary key (tenant_id, id),
  unique (tenant_id, day)
);
alter table kernel.holidays enable row level security;
create policy holidays_read on kernel.holidays for select to authenticated using (tenant_id = (select app.tenant()));
create policy holidays_admin on kernel.holidays for all to authenticated
  using (tenant_id = (select app.tenant()) and (select app.has_role('system_admin')))
  with check (tenant_id = (select app.tenant()) and (select app.has_role('system_admin')));
grant select, insert, update, delete on kernel.holidays to authenticated;

-- Audit the kernel tables that represent business facts.
create trigger audit after insert or update or delete on kernel.holidays for each row execute function kernel.audit_row();
create trigger audit after insert or update or delete on iam.memberships for each row execute function kernel.audit_row();
create trigger audit after insert or update on kernel.files for each row execute function kernel.audit_row();
