-- T-13 · R-109: adversarial isolation. Fails on any business table without
-- tenant_id + RLS + a composite primary key, and on any row visible across tenants.
begin;
select plan(9);

-- 1. Every table in the module schemas carries tenant_id, except the documented exceptions.
select is_empty($$
  select t.table_schema || '.' || t.table_name
  from information_schema.tables t
  where t.table_type = 'BASE TABLE'
    and t.table_schema in ('platform','iam','framework','org','cycle','approval','project','finance','kernel')
    and not exists (select 1 from information_schema.columns c where c.table_schema = t.table_schema and c.table_name = t.table_name and c.column_name = 'tenant_id')
    and (t.table_schema || '.' || t.table_name) not in (
      'platform.donors',            -- the tenant table itself (id IS the tenant)
      'platform.incidents',         -- operator-only, wbl_operator role, no tenant data
      'iam.persons', 'iam.mfa', 'iam.credentials',   -- global identity; RLS / revoked
      'cycle.application_transitions', 'project.project_transitions', 'project.deliverable_transitions',
      'project.amendment_transitions', 'finance.order_transitions')
$$, 'R-109 every business table has tenant_id');

-- 2. Every table in those schemas has RLS enabled (default deny).
select is_empty($$
  select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname in ('platform','iam','framework','org','cycle','approval','project','finance','kernel')
    and not c.relrowsecurity
    and (n.nspname || '.' || c.relname) not in ('platform.incidents','cycle.application_transitions','project.project_transitions',
      'project.deliverable_transitions','project.amendment_transitions','finance.order_transitions')
$$, 'R-109 RLS is enabled on every table');

-- 3. Every tenant table's primary key starts with tenant_id (composite keys).
select is_empty($$
  select tt.table_schema || '.' || tt.table_name from tests.tenant_tables tt
  where not exists (
    select 1 from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
    where i.indisprimary and n.nspname = tt.table_schema and c.relname = tt.table_name and a.attname = 'tenant_id')
$$, 'R-109 primary keys are composite (tenant_id, …)');

-- 4. Every foreign key between tenant tables includes tenant_id.
select is_empty($$
  select con.conname from pg_constraint con
  join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_class r on r.oid = con.confrelid join pg_namespace rn on rn.oid = r.relnamespace
  where con.contype = 'f'
    and exists (select 1 from tests.tenant_tables t where t.table_schema = n.nspname and t.table_name = c.relname)
    and exists (select 1 from tests.tenant_tables t where t.table_schema = rn.nspname and t.table_name = r.relname)
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum = any(con.conkey) and a.attname = 'tenant_id')
$$, 'R-109 foreign keys between tenant tables are composite');

-- 5. No policy in any schema refers to tenant_id without app.tenant() (no client-supplied tenant).
select is_empty($$
  select schemaname || '.' || tablename || ':' || policyname from pg_policies
  where schemaname in ('platform','iam','framework','org','cycle','approval','project','finance','kernel')
    and coalesce(qual, '') || coalesce(with_check, '') like '%tenant_id%'
    and coalesce(qual, '') || coalesce(with_check, '') not like '%app.tenant()%'
$$, 'R-109 every tenant predicate uses app.tenant() from the JWT');

-- 6. A tenant-B user sees zero tenant-A rows in EVERY tenant table.
create or replace function tests.cross_rows(p_other uuid) returns table (tbl text, n bigint) language plpgsql as $$
declare r record; c bigint;
begin
  for r in select * from tests.tenant_tables loop
    execute format('select count(*) from %I.%I where tenant_id = $1', r.table_schema, r.table_name) into c using p_other;
    if c > 0 then tbl := r.table_schema || '.' || r.table_name; n := c; return next; end if;
  end loop;
end $$;
grant execute on function tests.cross_rows(uuid) to authenticated;
-- grant select so "permission denied" cannot mask a leak: RLS must be the reason for zero rows
do $$ declare r record; begin
  for r in select * from tests.tenant_tables loop execute format('grant select on %I.%I to authenticated', r.table_schema, r.table_name); end loop;
end $$;

select set_config('request.jwt.claims', tests.claims('admin@second.demo', 'second-demo'), true);
set local role authenticated;
select is_empty($$ select * from tests.cross_rows(tests.tenant('almulhi-demo')) $$, 'R-109 tenant-B admin sees no tenant-A row in any table');
reset role;

select set_config('request.jwt.claims', tests.claims('ceo@almulhi.demo', 'almulhi-demo'), true);
set local role authenticated;
select is_empty($$ select * from tests.cross_rows(tests.tenant('second-demo')) $$, 'R-109 tenant-A executive sees no tenant-B row in any table');
reset role;

-- 7. A forged tenant claim (user of A claiming B) sees nothing at all — the claim is a selector, not an answer.
select set_config('request.jwt.claims', tests.forged('sara@almulhi.demo', 'second-demo'), true);
set local role authenticated;
select is(app.tenant(), null::uuid, 'R-109 a forged tenant claim resolves to no tenant');
select is((select count(*) from cycle.applications) + (select count(*) from org.associations) + (select count(*) from framework.versions), 0::bigint,
  'R-109 a forged tenant claim reads nothing');
reset role;

select * from finish();
rollback;
