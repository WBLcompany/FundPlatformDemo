-- T-15 · R-110: the database half of the role × action × relation matrix.
begin;
select plan(16);

select tests.make_application('almulhi-demo', '1287', 'sara@almulhi.demo') as albir_app \gset
select tests.make_application('almulhi-demo', '3345', 'khalid@almulhi.demo') as namaa_app \gset

-- Association owner: own application only.
select set_config('request.jwt.claims', tests.claims('owner@albir.demo', 'almulhi-demo'), true);
set local role authenticated;
select is((select count(*) from cycle.applications where id = :'albir_app'), 1::bigint, 'R-110 association owner reads its own application');
select is((select count(*) from cycle.applications where id = :'namaa_app'), 0::bigint, 'R-110 association owner cannot read another association''s application');
select is((select count(*) from org.associations), 1::bigint, 'R-014 an association sees only its own association record');
reset role;

-- Finance: payment data only (R-081).
select set_config('request.jwt.claims', tests.claims('finance@almulhi.demo', 'almulhi-demo'), true);
set local role authenticated;
select is((select count(*) from cycle.applications), 0::bigint, 'R-081 finance cannot open applications');
select is((select count(*) from cycle.study_files), 0::bigint, 'R-081 finance cannot open study files');
select isnt((select count(*) from finance.balances), 0::bigint, 'R-080 finance reads balances');
reset role;

-- Specialist: reads applications, cannot approve a framework version.
select set_config('request.jwt.claims', tests.claims('sara@almulhi.demo', 'almulhi-demo'), true);
set local role authenticated;
select is((select count(*) from cycle.applications where id in (:'albir_app', :'namaa_app')), 2::bigint, 'R-110 a specialist reads applications');
select throws_ok($$ insert into framework.versions (tenant_id, number, snapshot, snapshot_hash, reason, approved_by)
  values (app.tenant(), '2026-09', '{}', 'x', 'x', auth.uid()) $$, '42501', null, 'R-005 a specialist cannot approve a framework version');
select throws_ok($$ select finance.post((select id from finance.budget_accounts limit 1), 'allocation', 100, null, null) $$, '42501', null, 'invariant 6 a specialist cannot allocate budget');
reset role;

-- R-091: a system admin cannot grant themselves a role.
select set_config('request.jwt.claims', tests.claims('admin@almulhi.demo', 'almulhi-demo'), true);
set local role authenticated;
select throws_ok($$ insert into iam.memberships (tenant_id, person_id, role) values (app.tenant(), auth.uid(), 'executive') $$, '42501', null, 'R-091 a system admin cannot change their own permissions');
select lives_ok($$ insert into iam.memberships (tenant_id, person_id, role) values (app.tenant(), tests.person('khalid@almulhi.demo'), 'committee_secretary') $$, 'R-110 a system admin grants another person a staff role');
update iam.memberships set role = 'executive' where person_id = auth.uid();
select is((select role from iam.memberships where person_id = auth.uid()), 'system_admin', 'R-091 a system admin''s update of their own membership changes nothing');
reset role;

-- Association owner adds a user to their own association only (R-012).
select set_config('request.jwt.claims', tests.claims('owner@albir.demo', 'almulhi-demo'), true);
set local role authenticated;
select lives_ok($$ insert into iam.memberships (tenant_id, person_id, role, org_id) values (app.tenant(), tests.person('owner@namaa.demo'), 'assoc_applicant', (select id from org.associations limit 1)) $$,
  'R-012 the account owner adds a user with a specific role to their association');
select throws_ok($$ insert into iam.memberships (tenant_id, person_id, role, org_id) values (app.tenant(), tests.person('owner@namaa.demo'), 'assoc_applicant', (select id from org.associations where license_no = '3345' union select gen_random_uuid() limit 1)) $$,
  '42501', null, 'R-012 an owner cannot add users to another association');
reset role;

-- The operator role sees no tenant table at all (R-085).
set local role wbl_operator;
select throws_ok($$ select count(*) from cycle.applications $$, '42501', null, 'R-085 the operator cannot read applications');
select isnt((select count(*) from platform.operator_overview()), 0::bigint, 'R-083 the operator reads the platform overview');
reset role;

select * from finish();
rollback;
