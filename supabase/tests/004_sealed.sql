-- T-35 · R-039: in independent mode Manih's scores are hidden IN THE DATABASE
-- until the reading specialist records their own assessment.
begin;
select plan(5);

select tests.make_application('almulhi-demo', '1287', 'sara@almulhi.demo', 'in_review', 'independent') as app_id \gset
insert into cycle.ai_outputs (tenant_id, id, task, subject_kind, subject_id, status, idempotency_key, input_hash, output)
values (tests.tenant('almulhi-demo'), '00000000-0000-4000-8000-000000000001', 'application.study_file', 'application', :'app_id', 'pending', 'k1', 'h', null);
update cycle.ai_outputs set status = 'ready', output = '{"summary":{"text":"ملخص"}}' where id = '00000000-0000-4000-8000-000000000001';
insert into cycle.ai_sealed (tenant_id, ai_output_id, application_id, payload)
values (tests.tenant('almulhi-demo'), '00000000-0000-4000-8000-000000000001', :'app_id', '{"scores":[{"criterion":"need","score":4}]}');

select set_config('request.jwt.claims', tests.claims('sara@almulhi.demo', 'almulhi-demo'), true);
set local role authenticated;
select is((select count(*) from cycle.ai_outputs where subject_id = :'app_id'), 1::bigint, 'R-039 the open part (summary) is readable before assessment');
select is((select count(*) from cycle.ai_sealed where application_id = :'app_id'), 0::bigint, 'R-039 Manih''s scores are hidden before the specialist records an assessment');
insert into cycle.assessments (tenant_id, application_id, person_id, scores) values (app.tenant(), :'app_id', auth.uid(), '{"need":3}');
select is((select count(*) from cycle.ai_sealed where application_id = :'app_id'), 1::bigint, 'R-039 recording the assessment reveals them');
reset role;

-- Another specialist who has NOT assessed still cannot see them.
select set_config('request.jwt.claims', tests.claims('khalid@almulhi.demo', 'almulhi-demo'), true);
set local role authenticated;
select is((select count(*) from cycle.ai_sealed where application_id = :'app_id'), 0::bigint, 'R-039 the reveal is per specialist');
reset role;

select throws_ok($$ update cycle.ai_outputs set output = '{}' where id = '00000000-0000-4000-8000-000000000001' $$, null, null, 'invariant 8 an AI output is immutable once settled');

select * from finish();
rollback;
