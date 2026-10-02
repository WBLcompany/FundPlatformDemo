-- T-28 · invariants 2, 5, 7: the fixed state machine, version checks, and pinned content.
begin;
select plan(7);

select tests.make_application('almulhi-demo', '1287', 'sara@almulhi.demo', 'submitted') as app_id \gset

select throws_ok(format($$ update cycle.applications set status = 'approved', version = version + 1 where id = %L $$, :'app_id'), 'P0001', null, 'invariant 7 an illegal transition is refused by the database');
select throws_ok(format($$ update cycle.applications set status = 'in_review' where id = %L $$, :'app_id'), '40001', null, 'invariant 2 an update without a version bump is refused (optimistic concurrency)');
select lives_ok(format($$ update cycle.applications set status = 'in_review', version = version + 1 where id = %L $$, :'app_id'), 'invariant 7 a legal transition passes');
select throws_ok(format($$ update cycle.applications set form_data = '{"x":1}', version = version + 1 where id = %L $$, :'app_id'), null, null, 'invariant 5 submitted content cannot change outside an info request');
select throws_ok(format($$ update cycle.applications set framework_version_id = gen_random_uuid(), version = version + 1 where id = %L $$, :'app_id'), null, null, 'invariant 5 the framework version is pinned after submission');

select throws_ok($$ insert into cycle.applications (tenant_id, ref, association_id, program_id, framework_version_id, status, title)
  select tenant_id, 'X-1', association_id, program_id, framework_version_id, 'submitted', 't' from cycle.applications limit 1 $$, '23514', null, 'R-024 no submitted application without an assignee');

select throws_ok($$ update framework.versions set reason = 'x' $$, null, null, 'R-087 a framework version is immutable');

select * from finish();
rollback;
