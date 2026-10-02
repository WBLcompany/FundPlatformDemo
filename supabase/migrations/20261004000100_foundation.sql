-- T-12 · Foundation: module schemas, the tenant/role helpers every RLS policy
-- stands on, and the shared conventions (R-109, R-117).
--
-- Conventions every business table follows (asserted by supabase/tests/001_isolation.sql):
--   * tenant_id uuid not null, primary key (tenant_id, id), foreign keys composite (tenant_id, x_id)
--   * row level security enabled, default deny, every policy anchored on (select app.tenant())
--   * created_at timestamptz, money as bigint halalas

create schema if not exists app;
create schema if not exists platform;
create schema if not exists iam;
create schema if not exists framework;
create schema if not exists org;
create schema if not exists cycle;
create schema if not exists approval;
create schema if not exists project;
create schema if not exists finance;
create schema if not exists kernel;
create schema if not exists reporting;

create extension if not exists pg_trgm with schema public;

grant usage on schema app, platform, iam, framework, org, cycle, approval, project, finance, kernel, reporting to authenticated;
grant usage on schema app, platform, framework, org, iam to anon;

-- ── Tenants live in platform.donors; created here because every helper references them.
create table platform.donors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  subdomain text not null unique,
  ai_enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  plan text not null default 'standard',
  status text not null default 'active' check (status in ('onboarding','active','suspended')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Memberships: a person's role inside one donor tenant. One person may hold several.
create table iam.persons (
  id uuid primary key,              -- = auth.users.id
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table iam.memberships (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  person_id uuid not null references iam.persons(id),
  role text not null check (role in (
    'system_admin','grants_specialist','grants_manager','committee_secretary','finance','executive','external_reviewer',
    'assoc_owner','assoc_applicant','assoc_coordinator','supplier_rep')),
  org_id uuid,                                  -- association or supplier this membership acts for
  manager_person_id uuid references iam.persons(id),
  track text,                                   -- R-117: grants-manager scope, reserved from day one
  scope_application_id uuid,                    -- external reviewer: one application only (R-041)
  scope_expires_at timestamptz,
  granted_by uuid references iam.persons(id),
  active boolean not null default true,
  absent_from date,
  absent_until date,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, person_id, role, org_id)
);
create index memberships_person_idx on iam.memberships (person_id) where active;

-- ── The helpers. SECURITY DEFINER so they can read memberships without recursing
-- through memberships' own policies; each reads ONLY the caller's own rows.

-- The tenant claim is a SELECTOR, never an answer: it counts only when a live
-- membership for auth.uid() in that tenant exists. A worker session (role 'system')
-- is scoped to the event's tenant by the worker itself.
create or replace function app.tenant() returns uuid
language sql stable security definer set search_path = '' as $$
  select case
    when auth.jwt() ->> 'role' = 'system' then nullif(auth.jwt() ->> 'tenant_id', '')::uuid
    when auth.jwt() ->> 'role' = 'anon' then nullif(auth.jwt() ->> 'tenant_id', '')::uuid
    else (
      select m.tenant_id from iam.memberships m
      where m.person_id = auth.uid()
        and m.tenant_id::text = auth.jwt() ->> 'tenant_id'
        and m.active
      limit 1)
  end
$$;

create or replace function app.uid() returns uuid language sql stable as $$ select auth.uid() $$;

create or replace function app.is_system() returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'system'
$$;

create or replace function app.roles() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct m.role), '{}')
  from iam.memberships m
  where m.person_id = auth.uid() and m.active
    and m.tenant_id::text = auth.jwt() ->> 'tenant_id'
    and (m.scope_expires_at is null or m.scope_expires_at > now())
$$;

create or replace function app.has_role(r text) returns boolean language sql stable as $$
  select app.is_system() or r = any(app.roles())
$$;

create or replace function app.has_any(rs text[]) returns boolean language sql stable as $$
  select app.is_system() or app.roles() && rs
$$;

create or replace function app.is_staff() returns boolean language sql stable as $$
  select app.has_any(array['system_admin','grants_specialist','grants_manager','committee_secretary','finance','executive'])
$$;

-- Staff who may read application content (finance may not: R-081).
create or replace function app.is_program_staff() returns boolean language sql stable as $$
  select app.has_any(array['system_admin','grants_specialist','grants_manager','committee_secretary','executive'])
$$;

create or replace function app.org_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct m.org_id) filter (where m.org_id is not null), '{}')
  from iam.memberships m
  where m.person_id = auth.uid() and m.active
    and m.tenant_id::text = auth.jwt() ->> 'tenant_id'
    and m.role in ('assoc_owner','assoc_applicant','assoc_coordinator','supplier_rep')
$$;

create or replace function app.membership_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.id), '{}')
  from iam.memberships m
  where m.person_id = auth.uid() and m.active and m.tenant_id::text = auth.jwt() ->> 'tenant_id'
$$;

create or replace function app.reviewer_scope() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.scope_application_id) filter (where m.scope_application_id is not null), '{}')
  from iam.memberships m
  where m.person_id = auth.uid() and m.active and m.role = 'external_reviewer'
    and m.tenant_id::text = auth.jwt() ->> 'tenant_id'
    and (m.scope_expires_at is null or m.scope_expires_at > now())
$$;

grant execute on all functions in schema app to anon, authenticated;
revoke execute on function app.membership_ids(), app.org_ids(), app.reviewer_scope() from anon;

-- ── RLS for the two tables above.
alter table platform.donors enable row level security;
create policy donors_member_read on platform.donors for select to authenticated, anon
  using (id = (select app.tenant()));
create policy donors_admin_update on platform.donors for update to authenticated
  using (id = (select app.tenant()) and (select app.has_role('system_admin')))
  with check (id = (select app.tenant()));
grant select, update (name, ai_enabled, settings) on platform.donors to authenticated;
grant select on platform.donors to anon;

alter table iam.persons enable row level security;
-- A person is visible to themselves and to anyone sharing a tenant with them.
create policy persons_read on iam.persons for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from iam.memberships m where m.person_id = persons.id and m.tenant_id = (select app.tenant())));
create policy persons_self_update on iam.persons for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
grant select, update (full_name, phone) on iam.persons to authenticated;

alter table iam.memberships enable row level security;
-- R-091: nobody manages their own memberships, a system admin included.
create policy memberships_read on iam.memberships for select to authenticated using (
  tenant_id = (select app.tenant()) and (
    person_id = auth.uid()
    or (select app.is_staff())
    or (org_id is not null and org_id = any(coalesce((select app.org_ids()), '{}')))));
create policy memberships_admin_write on iam.memberships for insert to authenticated with check (
  tenant_id = (select app.tenant()) and person_id <> auth.uid() and (
    ((select app.has_role('system_admin')) and role not in ('assoc_owner','assoc_applicant','assoc_coordinator','supplier_rep'))
    or (role in ('assoc_applicant','assoc_coordinator') and org_id = any(coalesce((select app.org_ids()), '{}')) and (select app.has_role('assoc_owner')))
    or (select app.is_system())));
create policy memberships_admin_update on iam.memberships for update to authenticated using (
  tenant_id = (select app.tenant()) and person_id <> auth.uid() and (
    (select app.has_any(array['system_admin','grants_manager'])) or (select app.is_system())
    or (org_id = any(coalesce((select app.org_ids()), '{}')) and (select app.has_role('assoc_owner')))))
  with check (tenant_id = (select app.tenant()) and person_id <> auth.uid());
grant select, insert, update on iam.memberships to authenticated;
