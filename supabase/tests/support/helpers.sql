-- Test helpers, created once per test database (pg_prove runs files in order).
create extension if not exists pgtap;
create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

create or replace function tests.claims(p_email text, p_slug text) returns text language sql stable security definer as $$
  select json_build_object('role', 'authenticated', 'sub', p.id, 'tenant_id', d.id)::text
  from iam.persons p, platform.donors d where p.email = p_email and d.slug = p_slug
$$;
create or replace function tests.forged(p_email text, p_slug text) returns text language sql stable security definer as $$
  -- a real user claiming a tenant they are NOT a member of
  select json_build_object('role', 'authenticated', 'sub', p.id, 'tenant_id', d.id)::text
  from iam.persons p, platform.donors d where p.email = p_email and d.slug = p_slug
$$;
create or replace function tests.system(p_slug text) returns text language sql stable security definer as $$
  select json_build_object('role', 'system', 'tenant_id', d.id)::text from platform.donors d where d.slug = p_slug
$$;
create or replace function tests.anon(p_slug text) returns text language sql stable security definer as $$
  select json_build_object('role', 'anon', 'tenant_id', d.id)::text from platform.donors d where d.slug = p_slug
$$;
create or replace function tests.tenant(p_slug text) returns uuid language sql stable security definer as $$
  select id from platform.donors where slug = p_slug
$$;
create or replace function tests.person(p_email text) returns uuid language sql stable security definer as $$
  select id from iam.persons where email = p_email
$$;
grant execute on all functions in schema tests to authenticated, anon;

-- Every business table in the module schemas (tables carrying tenant_id).
create or replace view tests.tenant_tables as
  select c.table_schema, c.table_name
  from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.column_name = 'tenant_id' and t.table_type = 'BASE TABLE'
    and c.table_schema in ('platform','iam','framework','org','cycle','approval','project','finance','kernel','reporting')
    and (c.table_schema, c.table_name) <> ('platform', 'incidents');
grant select on tests.tenant_tables to authenticated, anon;


-- Fixture: one submitted application per call, inserted as the superuser (bypasses RLS on purpose).
create or replace function tests.make_application(p_slug text, p_license text, p_assignee_email text, p_status text default 'in_review', p_mode text default 'manih_first')
returns uuid language plpgsql security definer as $$
declare t uuid := tests.tenant(p_slug); a uuid; v uuid; m uuid; id uuid; n int;
begin
  select org.associations.id into a from org.associations where tenant_id = t and license_no = p_license;
  select framework.versions.id into v from framework.versions where tenant_id = t order by number desc limit 1;
  select mm.id into m from iam.memberships mm where mm.tenant_id = t and mm.person_id = tests.person(p_assignee_email) limit 1;
  select count(*) + 1 into n from cycle.applications where tenant_id = t;
  insert into cycle.applications (tenant_id, ref, association_id, program_id, framework_version_id, study_mode, status, title, requested_halalas, assignee_membership_id, submitted_at)
  values (t, 'ط-TEST-' || lpad(n::text, 4, '0') || '-' || substr(md5(random()::text), 1, 4), a, 'family-empowerment-1448', v, p_mode, p_status, 'طلب اختبار', 30000000, m, now())
  returning cycle.applications.id into id;
  return id;
end $$;
