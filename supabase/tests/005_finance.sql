-- T-38 · invariant 6: money in halalas, balances from an immutable ledger, reservations checked.
begin;
select plan(7);

select id as acct from finance.budget_accounts where tenant_id = tests.tenant('almulhi-demo') \gset

select set_config('request.jwt.claims', tests.claims('manager@almulhi.demo', 'almulhi-demo'), true);
set local role authenticated;
select lives_ok($$ select finance.post((select id from finance.budget_accounts limit 1), 'reservation', 35000000, 'application', gen_random_uuid()) $$, 'ق٥ a reservation within the balance succeeds');
select is((select reserved_halalas from finance.balances), 35000000::numeric, 'invariant 6 the balance is computed from the ledger');
select throws_ok($$ select finance.post((select id from finance.budget_accounts limit 1), 'reservation', 2000000000, 'application', gen_random_uuid()) $$, 'P0001', 'insufficient_budget', 'ق٥ a reservation above the available balance is refused');
select throws_ok($$ select finance.post((select id from finance.budget_accounts limit 1), 'release', 99000000, 'application', gen_random_uuid()) $$, 'P0001', 'exceeds_reserved', 'invariant 6 cannot release more than reserved');
select throws_ok($$ insert into finance.ledger (tenant_id, account_id, kind, amount_halalas) values (app.tenant(), (select id from finance.budget_accounts limit 1), 'allocation', 1) $$, '42501', null, 'invariant 6 the ledger is written only through finance.post');
reset role;

select throws_ok($$ update finance.ledger set amount_halalas = 1 $$, '42501', null, 'invariant 6 ledger rows are never updated');
select throws_ok($$ delete from finance.ledger $$, '42501', null, 'invariant 6 ledger rows are never deleted');

select * from finish();
rollback;
