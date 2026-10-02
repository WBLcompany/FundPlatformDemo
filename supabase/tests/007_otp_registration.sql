-- T-22 · T-23 · R-010, R-011: no account without the code sent to the official number; the letter path waits for review.
begin;
select plan(7);

select set_config('request.jwt.claims', tests.anon('almulhi-demo'), true);
set local role anon;
select iam.otp_issue('registration', '9001', '+966 5• ••• ••01', encode(digest('salt:123456', 'sha256'), 'hex')) as otp_id \gset
select is(iam.otp_verify(:'otp_id', 'registration', encode(digest('salt:000000', 'sha256'), 'hex')), 'wrong:4', 'R-010 a wrong code is refused and counted');
select throws_ok($$ select org.register_association('9001', 'جمعية', 'جدة', '+966500009001', 'i@n.sa', '{}', 'otp', gen_random_uuid(), null, gen_random_uuid(), 'مستخدم', 'u@n.sa', '+966500009009', 'h') $$,
  'P0001', 'otp_required', 'R-010 no account opens without a verified code');
select is(iam.otp_verify(:'otp_id', 'registration', encode(digest('salt:123456', 'sha256'), 'hex')), 'ok', 'R-010 the right code verifies');
select is(iam.otp_verify(:'otp_id', 'registration', encode(digest('salt:123456', 'sha256'), 'hex')), 'used', 'R-010 a code works once');
select lives_ok(format($$ select org.register_association('9001', 'جمعية جديدة', 'جدة', '+966500009001', 'i@n.sa', '{}', 'otp', %L, null, gen_random_uuid(), 'مستخدم', 'u@n.sa', '+966500009009', 'h') $$, :'otp_id'),
  'R-009 a verified licence opens the account');
select lives_ok($$ select org.register_association('9002', 'جمعية بخطاب', 'تبوك', '+966500009002', 'l@n.sa', '{}', 'letter', null, null, gen_random_uuid(), 'مستخدم', 'v@n.sa', '+966500009010', 'h') $$,
  'R-011 the letter path registers without a code');
reset role;
select is((select status from org.associations where license_no = '9002'), 'pending_review', 'R-011 a letter registration waits for the donor''s review');

select * from finish();
rollback;
