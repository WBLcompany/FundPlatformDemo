-- T-12 · T-14 · T-18 · T-20 · T-21 · T-22 · T-23 · T-24
-- platform (usage, support grants), iam (OTP, MFA, sensitive changes),
-- framework (draft + frozen versions), org (associations, documents, suppliers).

-- ── platform ─────────────────────────────────────────────────────────────────
create table platform.usage_events (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  kind text not null,                      -- application.submitted | application.completed | ai.task
  ref_id uuid,
  at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, kind, ref_id)
);
alter table platform.usage_events enable row level security;
create policy usage_write on platform.usage_events for insert to authenticated with check (tenant_id = (select app.tenant()) and (select app.is_system()));
create policy usage_read on platform.usage_events for select to authenticated using (tenant_id = (select app.tenant()) and (select app.has_any(array['system_admin','executive'])));
grant select, insert on platform.usage_events to authenticated;

-- R-085: the operator reaches tenant data only through a live support grant the donor issued.
create table platform.support_grants (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  operator_email text not null,
  reason text not null,
  granted_by uuid not null references iam.persons(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
alter table platform.support_grants enable row level security;
create policy support_admin on platform.support_grants for all to authenticated
  using (tenant_id = (select app.tenant()) and (select app.has_role('system_admin')))
  with check (tenant_id = (select app.tenant()) and (select app.has_role('system_admin')) and granted_by = auth.uid());
grant select, insert, update (revoked_at) on platform.support_grants to authenticated;

-- Operator console: a dedicated login role that sees NO tenant table, only these aggregates.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'wbl_operator') then create role wbl_operator nologin noinherit; end if;
end $$;
grant wbl_operator to authenticator;
grant usage on schema platform to wbl_operator;

create table platform.incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  severity text not null default 'minor' check (severity in ('minor','major','critical')),
  state text not null default 'open' check (state in ('open','monitoring','resolved')),
  tenant_id uuid references platform.donors(id),
  created_at timestamptz not null default now()
);
grant select, insert, update on platform.incidents to wbl_operator;

create or replace function platform.operator_overview()
returns table (donor_id uuid, name text, plan text, status text, completed_applications bigint, submitted_applications bigint, support_until timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.name, d.plan, d.status,
    (select count(*) from platform.usage_events u where u.tenant_id = d.id and u.kind = 'application.completed'),
    (select count(*) from platform.usage_events u where u.tenant_id = d.id and u.kind = 'application.submitted'),
    (select max(g.expires_at) from platform.support_grants g where g.tenant_id = d.id and g.revoked_at is null and g.expires_at > now())
  from platform.donors d order by d.name
$$;
revoke all on function platform.operator_overview() from public, anon, authenticated;
grant execute on function platform.operator_overview() to wbl_operator;

-- ── iam extras ───────────────────────────────────────────────────────────────
-- OTP challenges (R-010, R-092, R-070). The code is stored hashed; purpose binds a code to one use.
create table iam.otp_challenges (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  purpose text not null check (purpose in ('registration','delegation','bank_account','official_contact','signatory','login_step_up')),
  subject text not null,              -- licence number, person id, or account id this code is for
  target_masked text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0 check (attempts <= 5),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
create index otp_rate_idx on iam.otp_challenges (tenant_id, subject, created_at desc);
alter table iam.otp_challenges enable row level security;
-- No direct access at all: iam.otp_* functions below are the only path.
revoke all on iam.otp_challenges from public, anon, authenticated;

create or replace function iam.otp_issue(p_purpose text, p_subject text, p_masked text, p_code_hash text, p_ttl_seconds int default 300)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid := app.tenant(); recent int; id uuid;
begin
  if t is null then raise exception 'no tenant'; end if;
  select count(*) into recent from iam.otp_challenges where tenant_id = t and subject = p_subject and created_at > now() - interval '15 minutes';
  if recent >= 5 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  insert into iam.otp_challenges (tenant_id, purpose, subject, target_masked, code_hash, expires_at)
  values (t, p_purpose, p_subject, p_masked, p_code_hash, now() + make_interval(secs => p_ttl_seconds)) returning otp_challenges.id into id;
  return id;
end $$;

-- Returns 'ok' | 'wrong:<attempts left>' | 'expired' | 'locked' | 'used'.
create or replace function iam.otp_verify(p_id uuid, p_purpose text, p_code_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare c iam.otp_challenges; t uuid := app.tenant();
begin
  select * into c from iam.otp_challenges where tenant_id = t and id = p_id and purpose = p_purpose for update;
  if not found then return 'expired'; end if;
  if c.consumed_at is not null then return 'used'; end if;
  if c.expires_at < now() then return 'expired'; end if;
  if c.attempts >= 5 then return 'locked'; end if;
  if c.code_hash <> p_code_hash then
    update iam.otp_challenges set attempts = attempts + 1 where tenant_id = t and id = p_id;
    return 'wrong:' || (4 - c.attempts)::text;
  end if;
  update iam.otp_challenges set consumed_at = now() where tenant_id = t and id = p_id;
  return 'ok';
end $$;

-- A consumed challenge is proof for exactly one subsequent sensitive write.
create or replace function iam.otp_consumed(p_id uuid, p_purpose text, p_subject text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from iam.otp_challenges c where c.tenant_id = app.tenant() and c.id = p_id
    and c.purpose = p_purpose and c.subject = p_subject and c.consumed_at is not null and c.consumed_at > now() - interval '15 minutes')
$$;
revoke all on function iam.otp_issue(text,text,text,text,int), iam.otp_verify(uuid,text,text), iam.otp_consumed(uuid,text,text) from public;
grant execute on function iam.otp_issue(text,text,text,text,int), iam.otp_verify(uuid,text,text), iam.otp_consumed(uuid,text,text) to anon, authenticated;

-- MFA (TOTP) secrets for staff. Read only by the login function.
create table iam.mfa (
  person_id uuid primary key references iam.persons(id),
  secret_enc text not null,
  enrolled_at timestamptz not null default now()
);
alter table iam.mfa enable row level security;
revoke all on iam.mfa from public, anon, authenticated;

-- Local credentials. On Supabase this is GoTrue's job; locally (and in CI) a scrypt
-- hash lives here. Only the login function reads it; the schema is never exposed by an API.
create table iam.credentials (
  person_id uuid primary key references iam.persons(id),
  email text not null unique,
  password_hash text not null,
  disabled boolean not null default false
);
alter table iam.credentials enable row level security;
revoke all on iam.credentials from public, anon, authenticated;

create or replace function iam.login_lookup(p_email text)
returns table (person_id uuid, password_hash text, mfa_secret text, disabled boolean)
language sql stable security definer set search_path = '' as $$
  select c.person_id, c.password_hash, m.secret_enc, c.disabled
  from iam.credentials c left join iam.mfa m on m.person_id = c.person_id
  where lower(c.email) = lower(p_email)
$$;
-- Every live membership of a person, to choose the session tenant at login.
create or replace function iam.login_memberships(p_person uuid)
returns table (tenant_id uuid, slug text, subdomain text, role text, org_id uuid)
language sql stable security definer set search_path = '' as $$
  select m.tenant_id, d.slug, d.subdomain, m.role, m.org_id
  from iam.memberships m join platform.donors d on d.id = m.tenant_id
  where m.person_id = p_person and m.active and (m.scope_expires_at is null or m.scope_expires_at > now())
$$;
revoke all on function iam.login_lookup(text), iam.login_memberships(uuid) from public;
grant execute on function iam.login_lookup(text), iam.login_memberships(uuid) to anon;

-- Sensitive changes needing step-up and/or review (R-092, R-093, R-070).
create table iam.sensitive_changes (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  kind text not null check (kind in ('delegation','official_contact','signatory','bank_account')),
  org_id uuid not null,
  payload jsonb not null,
  otp_id uuid,
  status text not null default 'pending' check (status in ('pending','approved','rejected','applied')),
  requested_by uuid not null references iam.persons(id),
  reviewed_by uuid references iam.persons(id),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  primary key (tenant_id, id)
);
alter table iam.sensitive_changes enable row level security;
create policy sc_request on iam.sensitive_changes for insert to authenticated with check (
  tenant_id = (select app.tenant()) and requested_by = auth.uid() and status = 'pending'
  and org_id = any(coalesce((select app.org_ids()), '{}')) and (select app.has_role('assoc_owner'))
  and otp_id is not null and iam.otp_consumed(otp_id, case kind when 'bank_account' then 'bank_account' when 'delegation' then 'delegation' when 'signatory' then 'signatory' else 'official_contact' end, org_id::text));
create policy sc_read on iam.sensitive_changes for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.has_any(array['system_admin','grants_manager','finance'])) or org_id = any(coalesce((select app.org_ids()), '{}'))));
create policy sc_review on iam.sensitive_changes for update to authenticated using (
  tenant_id = (select app.tenant()) and (select app.has_any(array['system_admin','grants_manager','finance'])) and requested_by <> auth.uid())
  with check (tenant_id = (select app.tenant()) and reviewed_by = auth.uid());
grant select, insert, update (status, reviewed_by, review_note, reviewed_at) on iam.sensitive_changes to authenticated;
create trigger audit after insert or update on iam.sensitive_changes for each row execute function kernel.audit_row();

-- ── framework (D-04): one editable draft, frozen versions as JSON snapshots ───
create table framework.drafts (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  config jsonb not null,
  base_version_id uuid,
  updated_by uuid references iam.persons(id),
  updated_at timestamptz not null default now(),
  revision int not null default 1,
  primary key (tenant_id, id),
  unique (tenant_id)                                   -- exactly one open draft per donor
);
alter table framework.drafts enable row level security;
create policy drafts_admin on framework.drafts for all to authenticated
  using (tenant_id = (select app.tenant()) and (select app.has_any(array['system_admin','executive'])))
  with check (tenant_id = (select app.tenant()) and (select app.has_any(array['system_admin','executive'])));
grant select, insert, update on framework.drafts to authenticated;
create trigger audit after insert or update on framework.drafts for each row execute function kernel.audit_row();

create table framework.versions (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  number text not null check (number ~ '^[0-9]{4}-[0-9]{2}$'),
  snapshot jsonb not null,
  snapshot_hash text not null,
  reason text not null,
  changes jsonb not null default '[]'::jsonb,
  approved_by uuid not null references iam.persons(id),
  approved_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, number)
);
-- A version is immutable once written (R-087): the whole point is that a decision can name it.
create or replace function framework.versions_immutable() returns trigger language plpgsql as $$
begin raise exception 'framework versions are immutable (R-087)'; end $$;
create trigger versions_immutable before update or delete on framework.versions for each statement execute function framework.versions_immutable();
alter table framework.versions enable row level security;
create policy versions_read on framework.versions for select to authenticated, anon using (tenant_id = (select app.tenant()));
create policy versions_approve on framework.versions for insert to authenticated with check (
  tenant_id = (select app.tenant()) and approved_by = auth.uid() and (select app.has_any(array['system_admin','executive'])));
grant select, insert on framework.versions to authenticated;
grant select on framework.versions to anon;
create trigger audit after insert on framework.versions for each row execute function kernel.audit_row();

-- Policy documents (R-003, R-005): drafted (by Manih or by hand), approved by a person.
create table framework.policies (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  clauses jsonb not null default '[]'::jsonb,
  source_file_ids uuid[] not null default '{}',
  ai_output_id uuid,
  status text not null default 'draft' check (status in ('draft','approved','superseded')),
  approved_by uuid references iam.persons(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
alter table framework.policies enable row level security;
create policy policies_admin on framework.policies for all to authenticated
  using (tenant_id = (select app.tenant()) and (select app.has_any(array['system_admin','executive'])))
  with check (tenant_id = (select app.tenant()) and (select app.has_any(array['system_admin','executive'])));
grant select, insert, update on framework.policies to authenticated;
create trigger audit after insert or update on framework.policies for each row execute function kernel.audit_row();

-- The latest approved version (what the runtime reads for NEW applications).
create or replace view framework.current_version with (security_invoker = true) as
  select distinct on (tenant_id) tenant_id, id, number, snapshot, approved_at
  from framework.versions order by tenant_id, approved_at desc, number desc;
grant select on framework.current_version to authenticated, anon;

-- ── org ──────────────────────────────────────────────────────────────────────
create table org.associations (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  license_no text not null,
  name text not null,
  city text,
  official_phone text,
  official_email text,
  entity_snapshot jsonb,                       -- R-009: what the entities registry returned, kept as fetched
  entity_fetched_at timestamptz,
  registered_via text not null check (registered_via in ('otp','letter')),
  status text not null default 'active' check (status in ('pending_review','active','suspended','rejected')),
  suspended_reason text,
  suspended_until timestamptz,
  letter_file_id uuid,
  approved_by uuid references iam.persons(id),
  rating text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, license_no)               -- R-014: one account per donor, licence mandatory
);
alter table org.associations enable row level security;
create policy assoc_read on org.associations for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_staff()) or id = any(coalesce((select app.org_ids()), '{}'))
    or exists (select 1 from iam.memberships m where m.person_id = auth.uid() and m.role = 'external_reviewer' and m.tenant_id = associations.tenant_id)));
create policy assoc_staff_update on org.associations for update to authenticated using (
  tenant_id = (select app.tenant()) and (select app.has_any(array['system_admin','grants_manager','grants_specialist'])) or (select app.is_system()))
  with check (tenant_id = (select app.tenant()));
create policy assoc_system_insert on org.associations for insert to authenticated with check (tenant_id = (select app.tenant()) and (select app.is_system()));
grant select, insert, update on org.associations to authenticated;
create trigger audit after insert or update on org.associations for each row execute function kernel.audit_row();

-- Registration by OTP or by letter: anon cannot write tables, so this definer function
-- is the one door, and it requires a consumed registration OTP for that licence (R-010)
-- unless the path is the letter one, which lands in pending_review for a staff decision (R-011).
create or replace function org.register_association(
  p_license text, p_name text, p_city text, p_phone text, p_email text, p_snapshot jsonb,
  p_via text, p_otp_id uuid, p_letter_file_id uuid,
  p_person_id uuid, p_full_name text, p_person_email text, p_person_phone text, p_password_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid := app.tenant(); a uuid;
begin
  if t is null then raise exception 'no tenant'; end if;
  if p_via = 'otp' and not iam.otp_consumed(p_otp_id, 'registration', p_license) then
    raise exception 'otp_required' using errcode = 'P0001';
  end if;
  if p_via not in ('otp','letter') then raise exception 'bad path'; end if;
  insert into org.associations (tenant_id, license_no, name, city, official_phone, official_email, entity_snapshot, entity_fetched_at, registered_via, status, letter_file_id)
  values (t, p_license, p_name, p_city, p_phone, p_email, p_snapshot, now(), p_via, case when p_via = 'otp' then 'active' else 'pending_review' end, p_letter_file_id)
  returning id into a;
  insert into iam.persons (id, full_name, email, phone) values (p_person_id, p_full_name, p_person_email, p_person_phone)
  on conflict (id) do nothing;
  insert into iam.credentials (person_id, email, password_hash) values (p_person_id, p_person_email, p_password_hash)
  on conflict (person_id) do nothing;
  insert into iam.memberships (tenant_id, person_id, role, org_id, active)
  values (t, p_person_id, 'assoc_owner', a, p_via = 'otp');
  insert into kernel.outbox (tenant_id, event_type, entity_kind, entity_id, actor, payload)
  values (t, 'association.registered', 'association', a, p_person_id, jsonb_build_object('via', p_via, 'org_id', a));
  return a;
end $$;
revoke all on function org.register_association(text,text,text,text,text,jsonb,text,uuid,uuid,uuid,text,text,text,text) from public;
grant execute on function org.register_association(text,text,text,text,text,jsonb,text,uuid,uuid,uuid,text,text,text,text) to anon;

create table org.documents (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  association_id uuid not null,
  doc_type text not null,
  number text,
  issue_date date,
  expiry_date date,
  file_id uuid,
  status text not null default 'pending' check (status in ('pending','confirmed','superseded')),
  ai_output_id uuid,
  confirmed_by uuid references iam.persons(id),
  confirmed_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, association_id) references org.associations (tenant_id, id),
  foreign key (tenant_id, file_id) references kernel.files (tenant_id, id)
);
create index documents_expiry_idx on org.documents (tenant_id, expiry_date) where status = 'confirmed';
alter table org.documents enable row level security;
create policy docs_read on org.documents for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_staff()) or association_id = any(coalesce((select app.org_ids()), '{}'))));
create policy docs_assoc_write on org.documents for insert to authenticated with check (
  tenant_id = (select app.tenant()) and association_id = any(coalesce((select app.org_ids()), '{}')));
create policy docs_assoc_update on org.documents for update to authenticated using (
  tenant_id = (select app.tenant()) and (association_id = any(coalesce((select app.org_ids()), '{}')) or (select app.is_system())))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on org.documents to authenticated;
create trigger audit after insert or update on org.documents for each row execute function kernel.audit_row();

-- R-013 state: valid | near (within 30 days) | expired, computed, never stored.
create or replace view org.document_states with (security_invoker = true) as
  select d.*, case
    when d.expiry_date is null then 'valid'
    when d.expiry_date < (now() at time zone 'Asia/Riyadh')::date then 'expired'
    when d.expiry_date <= (now() at time zone 'Asia/Riyadh')::date + 30 then 'near'
    else 'valid' end as state
  from org.documents d where d.status = 'confirmed';
grant select on org.document_states to authenticated;

create table org.suppliers (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  name text not null,
  cr_number text,
  contact_email text,
  billing_mode text not null default 'invoice' check (billing_mode in ('prepaid','invoice')),
  prepaid_balance_halalas bigint not null default 0 check (prepaid_balance_halalas >= 0),
  low_balance_threshold_halalas bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
alter table org.suppliers enable row level security;
create policy suppliers_read on org.suppliers for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_staff()) or id = any(coalesce((select app.org_ids()), '{}'))));
create policy suppliers_admin on org.suppliers for all to authenticated
  using (tenant_id = (select app.tenant()) and ((select app.has_any(array['system_admin','grants_manager'])) or (select app.is_system())))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on org.suppliers to authenticated;
create trigger audit after insert or update on org.suppliers for each row execute function kernel.audit_row();
