-- T-16 · R-095: append-only audit log with a per-tenant hash chain.
begin;
select plan(7);

select tests.make_application('almulhi-demo', '1287', 'sara@almulhi.demo') as app_id \gset
select isnt((select count(*) from kernel.audit_log where entity_id = :'app_id'), 0::bigint, 'R-095 creating an application writes an audit entry');

update cycle.applications set status = 'awaiting_info', version = version + 1 where id = :'app_id';
select is((select after->>'status' from kernel.audit_log where entity_id = :'app_id' order by id desc limit 1), 'awaiting_info', 'R-095 a state change is recorded with its new value');

select throws_ok($$ update kernel.audit_log set action = 'x' $$, '42501', null, 'R-095 even the superuser cannot update the audit log');
select throws_ok($$ delete from kernel.audit_log $$, '42501', null, 'R-095 even the superuser cannot delete from the audit log');

select is(kernel.verify_audit_chain(tests.tenant('almulhi-demo')), null::bigint, 'R-095 the hash chain verifies intact');

-- Tamper: bypass the trigger as the owner would have to, then detect it.
alter table kernel.audit_log disable trigger audit_no_update;
update kernel.audit_log set after = '{"forged":true}'::jsonb where id = (select min(id) from kernel.audit_log where tenant_id = tests.tenant('almulhi-demo'));
alter table kernel.audit_log enable trigger audit_no_update;
select isnt(kernel.verify_audit_chain(tests.tenant('almulhi-demo')), null::bigint, 'R-095 tampering breaks the chain and is detected');

select set_config('request.jwt.claims', tests.claims('sara@almulhi.demo', 'almulhi-demo'), true);
set local role authenticated;
select is((select count(*) from kernel.audit_log), 0::bigint, 'R-095 a specialist cannot read the raw audit log');
reset role;

select * from finish();
rollback;
