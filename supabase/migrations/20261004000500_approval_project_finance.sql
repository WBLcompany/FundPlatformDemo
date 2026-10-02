-- T-37–T-50 · approval engine, committee, agreements, projects, deliverables,
-- amendments, final reports, and finance (ledger, installments, disbursements, bank accounts).

-- ── approval: one engine for grants, disbursements and amendments (architecture §6)
create table approval.instances (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  subject_kind text not null check (subject_kind in ('application','disbursement','amendment')),
  subject_id uuid not null,
  chain jsonb not null,               -- frozen applicable levels at open time: [{key,label,role,committee}]
  current_level int not null default 0,
  status text not null default 'open' check (status in ('open','approved','rejected','returned')),
  amount_halalas bigint,
  framework_version_id uuid,
  version int not null default 1,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  primary key (tenant_id, id)
);
create unique index approval_open_subject_idx on approval.instances (tenant_id, subject_kind, subject_id) where status = 'open';
create or replace function approval.guard_instance() returns trigger language plpgsql as $$
begin
  if new.version <> old.version + 1 then raise exception 'stale_version' using errcode = '40001'; end if;
  if old.status <> 'open' then raise exception 'approval instance is closed'; end if;
  return new;
end $$;
create trigger guard before update on approval.instances for each row execute function approval.guard_instance();
alter table approval.instances enable row level security;
create policy ai_read on approval.instances for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_program_staff()) or (subject_kind = 'disbursement' and (select app.has_role('finance')))));
create policy ai_write on approval.instances for all to authenticated
  using (tenant_id = (select app.tenant()) and ((select app.is_staff()) or (select app.is_system())))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on approval.instances to authenticated;
create trigger audit after insert or update on approval.instances for each row execute function kernel.audit_row();

create table approval.actions (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  instance_id uuid not null,
  level int not null,
  level_key text not null,
  actor uuid not null references iam.persons(id),
  action text not null check (action in ('approve','reject','return','modify_amount')),
  amount_halalas bigint,
  note text,
  meeting_id uuid,
  at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, instance_id) references approval.instances (tenant_id, id),
  check (action not in ('reject','return') or length(btrim(coalesce(note,''))) > 0)
);
create trigger no_change before update or delete on approval.actions for each statement execute function kernel.audit_immutable();
alter table approval.actions enable row level security;
create policy aa_read on approval.actions for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_program_staff()) or (select app.has_role('finance'))));
create policy aa_insert on approval.actions for insert to authenticated with check (tenant_id = (select app.tenant()) and actor = auth.uid());
grant select, insert on approval.actions to authenticated;
create trigger audit after insert on approval.actions for each row execute function kernel.audit_row();

create table approval.committee_meetings (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  title text not null,
  held_on date not null,
  minutes_file_id uuid,
  extract_output_id uuid,
  recorded_by uuid not null references iam.persons(id),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, minutes_file_id) references kernel.files (tenant_id, id)
);
alter table approval.committee_meetings enable row level security;
create policy cm_rw on approval.committee_meetings for all to authenticated
  using (tenant_id = (select app.tenant()) and (select app.is_program_staff()))
  with check (tenant_id = (select app.tenant()) and (select app.has_any(array['committee_secretary','grants_manager'])));
grant select, insert, update on approval.committee_meetings to authenticated;
create trigger audit after insert or update on approval.committee_meetings for each row execute function kernel.audit_row();

-- ── project
create table project.agreements (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  ref text not null,
  application_id uuid not null,
  version_no int not null default 1,          -- 1 = original, 2+ = annexes (R-059)
  amendment_id uuid,
  terms jsonb not null,                       -- amount, schedule, deliverables as approved
  generated_file_id uuid,
  signed_file_id uuid,
  association_signed_by uuid references iam.persons(id),
  association_signed_at timestamptz,
  donor_signed_by uuid references iam.persons(id),
  donor_signed_at timestamptz,
  status text not null default 'issued' check (status in ('issued','association_signed','fully_signed','superseded')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, application_id, version_no),
  foreign key (tenant_id, application_id) references cycle.applications (tenant_id, id),
  check (donor_signed_at is null or association_signed_at is not null)   -- R-049 order
);
alter table project.agreements enable row level security;
create policy ag_read on project.agreements for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_staff()) or exists (
    select 1 from cycle.applications a where a.tenant_id = agreements.tenant_id and a.id = agreements.application_id and a.association_id = any(coalesce((select app.org_ids()), '{}')))));
create policy ag_staff on project.agreements for insert to authenticated with check (tenant_id = (select app.tenant()) and ((select app.is_program_staff()) or (select app.is_system())));
create policy ag_sign on project.agreements for update to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.has_any(array['executive','grants_manager','system_admin'])) or (select app.is_system()) or ((select app.has_role('assoc_owner')) and exists (
    select 1 from cycle.applications a where a.tenant_id = agreements.tenant_id and a.id = agreements.application_id and a.association_id = any(coalesce((select app.org_ids()), '{}'))))))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on project.agreements to authenticated;
create trigger audit after insert or update on project.agreements for each row execute function kernel.audit_row();

create table project.projects (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  ref text not null,
  application_id uuid not null,
  association_id uuid not null,
  current_agreement_id uuid not null,
  program_id text not null,
  framework_version_id uuid not null,
  approved_halalas bigint not null check (approved_halalas >= 0),
  waqf_category text,
  status text not null default 'active' check (status in ('active','suspended','closing','closed')),
  suspended_reason text,
  suspended_at timestamptz,
  suspended_days int not null default 0,       -- R-069: suspension is not counted as delay
  version int not null default 1,
  specialist_membership_id uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  primary key (tenant_id, id),
  unique (tenant_id, ref),
  unique (tenant_id, application_id),
  foreign key (tenant_id, application_id) references cycle.applications (tenant_id, id),
  foreign key (tenant_id, association_id) references org.associations (tenant_id, id),
  foreign key (tenant_id, current_agreement_id) references project.agreements (tenant_id, id)
);
create table project.project_transitions (from_status text, to_status text, primary key (from_status, to_status));
insert into project.project_transitions values ('active','suspended'), ('suspended','active'), ('active','closing'), ('closing','active'), ('closing','closed');
create or replace function project.guard_project() returns trigger language plpgsql as $$
begin
  if new.version <> old.version + 1 then raise exception 'stale_version' using errcode = '40001'; end if;
  if new.status <> old.status and not exists (select 1 from project.project_transitions where from_status = old.status and to_status = new.status) then
    raise exception 'illegal transition % -> %', old.status, new.status;
  end if;
  return new;
end $$;
create trigger guard before update on project.projects for each row execute function project.guard_project();
alter table project.projects enable row level security;
create policy pr_read on project.projects for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_staff()) or association_id = any(coalesce((select app.org_ids()), '{}'))));
create policy pr_write on project.projects for all to authenticated
  using (tenant_id = (select app.tenant()) and ((select app.is_program_staff()) or (select app.is_system())))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on project.projects to authenticated;
create trigger audit after insert or update on project.projects for each row execute function kernel.audit_row();

create table project.deliverables (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  seq int not null,
  label text not null,
  due_date date not null,
  installment_seq int,
  status text not null default 'pending' check (status in ('pending','submitted','accepted','returned','rejected')),
  submission jsonb,
  file_ids uuid[] not null default '{}',
  review_output_id uuid,
  decided_by uuid references iam.persons(id),
  decided_at timestamptz,
  decision_note text,
  reminder_sent_at timestamptz,
  escalated_at timestamptz,
  version int not null default 1,
  primary key (tenant_id, id),
  unique (tenant_id, project_id, seq),
  foreign key (tenant_id, project_id) references project.projects (tenant_id, id),
  check (status not in ('accepted','rejected','returned') or (decided_by is not null and decided_at is not null))
);
create table project.deliverable_transitions (from_status text, to_status text, primary key (from_status, to_status));
insert into project.deliverable_transitions values ('pending','submitted'), ('submitted','accepted'), ('submitted','returned'), ('submitted','rejected'), ('returned','submitted');
create or replace function project.guard_deliverable() returns trigger language plpgsql as $$
begin
  if new.version <> old.version + 1 then raise exception 'stale_version' using errcode = '40001'; end if;
  if new.status <> old.status and not exists (select 1 from project.deliverable_transitions where from_status = old.status and to_status = new.status) then
    raise exception 'illegal transition % -> %', old.status, new.status;
  end if;
  return new;
end $$;
create trigger guard before update on project.deliverables for each row execute function project.guard_deliverable();
alter table project.deliverables enable row level security;
create policy dl_read on project.deliverables for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_staff()) or exists (
    select 1 from project.projects p where p.tenant_id = deliverables.tenant_id and p.id = deliverables.project_id and p.association_id = any(coalesce((select app.org_ids()), '{}')))));
create policy dl_write on project.deliverables for all to authenticated
  using (tenant_id = (select app.tenant()) and ((select app.is_program_staff()) or (select app.is_system()) or exists (
    select 1 from project.projects p where p.tenant_id = deliverables.tenant_id and p.id = deliverables.project_id and p.association_id = any(coalesce((select app.org_ids()), '{}')))))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on project.deliverables to authenticated;
create trigger audit after insert or update on project.deliverables for each row execute function kernel.audit_row();

create table project.amendments (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  requested_by uuid not null references iam.persons(id),
  requested_side text not null check (requested_side in ('association','donor')),
  justification text not null check (length(btrim(justification)) > 0),
  changes jsonb not null,                 -- {amount_halalas?, schedule?, deliverables?}
  diff_output_id uuid,
  status text not null default 'submitted' check (status in ('submitted','in_approval','awaiting_signatory','approved','rejected','expired')),
  signatory_response text check (signatory_response in ('accepted','declined')),
  signatory_due_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (tenant_id, id),
  foreign key (tenant_id, project_id) references project.projects (tenant_id, id)
);
create table project.amendment_transitions (from_status text, to_status text, primary key (from_status, to_status));
insert into project.amendment_transitions values ('submitted','in_approval'), ('in_approval','approved'), ('in_approval','rejected'),
  ('in_approval','awaiting_signatory'), ('awaiting_signatory','approved'), ('awaiting_signatory','rejected'), ('awaiting_signatory','expired');
create or replace function project.guard_amendment() returns trigger language plpgsql as $$
begin
  if new.version <> old.version + 1 then raise exception 'stale_version' using errcode = '40001'; end if;
  if new.status <> old.status and not exists (select 1 from project.amendment_transitions where from_status = old.status and to_status = new.status) then
    raise exception 'illegal transition % -> %', old.status, new.status;
  end if;
  return new;
end $$;
create trigger guard before update on project.amendments for each row execute function project.guard_amendment();
alter table project.amendments enable row level security;
create policy am_read on project.amendments for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_program_staff()) or exists (
    select 1 from project.projects p where p.tenant_id = amendments.tenant_id and p.id = amendments.project_id and p.association_id = any(coalesce((select app.org_ids()), '{}')))));
create policy am_write on project.amendments for all to authenticated
  using (tenant_id = (select app.tenant()) and ((select app.is_program_staff()) or (select app.is_system()) or exists (
    select 1 from project.projects p where p.tenant_id = amendments.tenant_id and p.id = amendments.project_id and p.association_id = any(coalesce((select app.org_ids()), '{}')))))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on project.amendments to authenticated;
create trigger audit after insert or update on project.amendments for each row execute function kernel.audit_row();

create table project.final_reports (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  narrative text not null,
  beneficiaries int not null check (beneficiaries >= 0),      -- R-071: unified numeric fields
  female_beneficiaries int check (female_beneficiaries >= 0),
  outputs jsonb not null default '{}'::jsonb,
  spent_halalas bigint not null check (spent_halalas >= 0),
  unspent_disposition text check (unspent_disposition in ('returned','reallocated','waived')),
  unspent_halalas bigint check (unspent_halalas >= 0),
  review_output_id uuid,
  status text not null default 'submitted' check (status in ('submitted','accepted','returned')),
  decided_by uuid references iam.persons(id),
  decided_at timestamptz,
  performance_rating text,
  performance_note text,
  performance_output_id uuid,
  performance_visible text not null default 'internal' check (performance_visible in ('internal','full','summary')),
  association_reply text,
  submitted_at timestamptz not null default now(),
  version int not null default 1,
  primary key (tenant_id, id),
  unique (tenant_id, project_id),
  foreign key (tenant_id, project_id) references project.projects (tenant_id, id)
);
alter table project.final_reports enable row level security;
create policy fr_read on project.final_reports for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_program_staff()) or exists (
    select 1 from project.projects p where p.tenant_id = final_reports.tenant_id and p.id = final_reports.project_id and p.association_id = any(coalesce((select app.org_ids()), '{}')))));
create policy fr_write on project.final_reports for all to authenticated
  using (tenant_id = (select app.tenant()) and ((select app.is_program_staff()) or (select app.is_system()) or exists (
    select 1 from project.projects p where p.tenant_id = final_reports.tenant_id and p.id = final_reports.project_id and p.association_id = any(coalesce((select app.org_ids()), '{}')))))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on project.final_reports to authenticated;
create trigger audit after insert or update on project.final_reports for each row execute function kernel.audit_row();

-- ── finance (invariant 6): balances come from an append-only ledger
create table finance.budget_accounts (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  name text not null,
  period text not null,                 -- '1448' / '2026'
  program_id text,
  waqf_category text,
  primary key (tenant_id, id),
  unique (tenant_id, name, period)
);
alter table finance.budget_accounts enable row level security;
create policy ba_read on finance.budget_accounts for select to authenticated using (
  tenant_id = (select app.tenant()) and (select app.has_any(array['finance','executive','grants_manager','system_admin'])));
create policy ba_admin on finance.budget_accounts for insert to authenticated with check (
  tenant_id = (select app.tenant()) and (select app.has_any(array['finance','system_admin'])));
grant select, insert on finance.budget_accounts to authenticated;

create table finance.ledger (
  tenant_id uuid not null references platform.donors(id),
  id bigint generated always as identity,
  account_id uuid not null,
  kind text not null check (kind in ('allocation','reservation','release','disbursement')),
  amount_halalas bigint not null check (amount_halalas > 0),
  ref_kind text,
  ref_id uuid,
  note text,
  actor uuid,
  at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, account_id) references finance.budget_accounts (tenant_id, id)
);
create index ledger_account_idx on finance.ledger (tenant_id, account_id);
create trigger no_change before update or delete on finance.ledger for each statement execute function kernel.audit_immutable();
alter table finance.ledger enable row level security;
create policy lg_read on finance.ledger for select to authenticated using (
  tenant_id = (select app.tenant()) and (select app.has_any(array['finance','executive','grants_manager','system_admin'])));
revoke insert on finance.ledger from authenticated;
grant select on finance.ledger to authenticated;
create trigger audit after insert on finance.ledger for each row execute function kernel.audit_row();

-- available = allocations - reservations + releases ; committed = reservations - releases - disbursements
create or replace view finance.balances with (security_invoker = true) as
  select a.tenant_id, a.id as account_id, a.name, a.period,
    coalesce(sum(l.amount_halalas) filter (where l.kind = 'allocation'), 0) as allocated_halalas,
    coalesce(sum(l.amount_halalas) filter (where l.kind = 'reservation'), 0)
      - coalesce(sum(l.amount_halalas) filter (where l.kind = 'release'), 0) as reserved_halalas,
    coalesce(sum(l.amount_halalas) filter (where l.kind = 'disbursement'), 0) as disbursed_halalas,
    coalesce(sum(l.amount_halalas) filter (where l.kind = 'allocation'), 0)
      - coalesce(sum(l.amount_halalas) filter (where l.kind = 'reservation'), 0)
      + coalesce(sum(l.amount_halalas) filter (where l.kind = 'release'), 0) as available_halalas
  from finance.budget_accounts a left join finance.ledger l on l.tenant_id = a.tenant_id and l.account_id = a.id
  group by a.tenant_id, a.id, a.name, a.period;
grant select on finance.balances to authenticated;

-- The only writers to the ledger. Reservation LOCKS the account row, so two concurrent
-- final approvals cannot both pass the balance check (T-38, ق٥).
create or replace function finance.post(p_account uuid, p_kind text, p_amount bigint, p_ref_kind text, p_ref uuid, p_note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare t uuid := app.tenant(); avail bigint; reserved bigint; new_id bigint;
begin
  if t is null then raise exception 'no tenant'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_kind = 'allocation' and not app.has_any(array['finance','system_admin']) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind in ('reservation','release') and not (app.is_program_staff() or app.is_system()) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind = 'disbursement' and not (app.has_role('finance') or app.is_system()) then raise exception 'not allowed' using errcode = '42501'; end if;
  perform 1 from finance.budget_accounts where tenant_id = t and id = p_account for update;
  if not found then raise exception 'unknown account'; end if;
  if p_kind = 'reservation' then
    select coalesce(sum(case kind when 'allocation' then amount_halalas when 'reservation' then -amount_halalas when 'release' then amount_halalas else 0 end), 0)
      into avail from finance.ledger where tenant_id = t and account_id = p_account;
    if avail < p_amount then raise exception 'insufficient_budget' using errcode = 'P0001'; end if;
  elsif p_kind in ('release','disbursement') then
    select coalesce(sum(case kind when 'reservation' then amount_halalas when 'release' then -amount_halalas when 'disbursement' then -amount_halalas else 0 end), 0)
      into reserved from finance.ledger where tenant_id = t and account_id = p_account;
    if reserved < p_amount then raise exception 'exceeds_reserved' using errcode = 'P0001'; end if;
  end if;
  insert into finance.ledger (tenant_id, account_id, kind, amount_halalas, ref_kind, ref_id, note, actor)
  values (t, p_account, p_kind, p_amount, p_ref_kind, p_ref, p_note, auth.uid()) returning id into new_id;
  return new_id;
end $$;
revoke all on function finance.post(uuid,text,bigint,text,uuid,text) from public, anon;
grant execute on function finance.post(uuid,text,bigint,text,uuid,text) to authenticated;

create table finance.bank_accounts (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  association_id uuid not null,
  bank_name text not null,
  iban_enc bytea not null,              -- envelope-encrypted; never in reports or the audit log
  iban_last4 text not null check (iban_last4 ~ '^[0-9A-Z]{4}$'),
  status text not null default 'pending' check (status in ('pending','acknowledged','replaced')),
  change_id uuid,
  acknowledged_by uuid references iam.persons(id),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, association_id) references org.associations (tenant_id, id)
);
create unique index bank_current_idx on finance.bank_accounts (tenant_id, association_id) where status = 'acknowledged';
alter table finance.bank_accounts enable row level security;
create policy bank_read on finance.bank_accounts for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.has_any(array['finance','grants_manager','system_admin'])) or association_id = any(coalesce((select app.org_ids()), '{}'))));
create policy bank_insert on finance.bank_accounts for insert to authenticated with check (
  tenant_id = (select app.tenant()) and status = 'pending' and association_id = any(coalesce((select app.org_ids()), '{}')) and (select app.has_role('assoc_owner')));
-- R-070: only finance acknowledges, and never the person who requested the change.
create policy bank_ack on finance.bank_accounts for update to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.has_role('finance')) or (select app.is_system())))
  with check (tenant_id = (select app.tenant()));
grant select (tenant_id, id, association_id, bank_name, iban_last4, status, change_id, acknowledged_by, acknowledged_at, created_at) on finance.bank_accounts to authenticated;
grant insert, update (status, acknowledged_by, acknowledged_at) on finance.bank_accounts to authenticated;
create trigger audit after insert or update on finance.bank_accounts for each row execute function kernel.audit_row();

create table finance.installments (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  seq int not null,
  label text not null,
  amount_halalas bigint not null check (amount_halalas > 0),
  condition text not null default 'deliverable' check (condition in ('signature','deliverable','final_report')),
  deliverable_seq int,
  status text not null default 'scheduled' check (status in ('scheduled','due','ordered','paid','cancelled')),
  primary key (tenant_id, id),
  unique (tenant_id, project_id, seq),
  foreign key (tenant_id, project_id) references project.projects (tenant_id, id)
);
alter table finance.installments enable row level security;
create policy inst_read on finance.installments for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_staff()) or exists (
    select 1 from project.projects p where p.tenant_id = installments.tenant_id and p.id = installments.project_id and p.association_id = any(coalesce((select app.org_ids()), '{}')))));
create policy inst_write on finance.installments for all to authenticated
  using (tenant_id = (select app.tenant()) and ((select app.is_staff()) or (select app.is_system())))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on finance.installments to authenticated;
create trigger audit after insert or update on finance.installments for each row execute function kernel.audit_row();

create table finance.disbursement_orders (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  ref text not null,
  installment_id uuid not null,
  project_id uuid not null,
  association_id uuid not null,
  account_id uuid not null,              -- budget account to draw the reservation from
  amount_halalas bigint not null check (amount_halalas > 0),
  bank_account_id uuid,
  status text not null default 'pending_checks' check (status in ('pending_checks','blocked','in_approval','ready','returned','executed','suspended')),
  blockers jsonb not null default '[]'::jsonb,
  returned_reason text,
  returned_to text,                      -- who owns the fix (R-065)
  executed_by uuid references iam.persons(id),
  executed_at timestamptz,
  proof_file_id uuid,
  finance_ref text,                      -- R-068
  receipt_due_at timestamptz,
  receipt_file_id uuid,
  receipt_received_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, ref),
  unique (tenant_id, installment_id),
  foreign key (tenant_id, installment_id) references finance.installments (tenant_id, id),
  foreign key (tenant_id, project_id) references project.projects (tenant_id, id),
  foreign key (tenant_id, association_id) references org.associations (tenant_id, id),
  foreign key (tenant_id, bank_account_id) references finance.bank_accounts (tenant_id, id),
  check (status <> 'executed' or (executed_by is not null and proof_file_id is not null)),
  check (status <> 'returned' or length(btrim(coalesce(returned_reason,''))) > 0)
);
create table finance.order_transitions (from_status text, to_status text, primary key (from_status, to_status));
insert into finance.order_transitions values
  ('pending_checks','blocked'), ('pending_checks','in_approval'), ('blocked','pending_checks'), ('in_approval','ready'), ('in_approval','returned'),
  ('ready','executed'), ('ready','returned'), ('returned','ready'), ('ready','suspended'), ('in_approval','suspended'), ('suspended','ready'), ('suspended','in_approval'),
  ('blocked','suspended'), ('suspended','pending_checks');
create or replace function finance.guard_order() returns trigger language plpgsql as $$
begin
  if new.version <> old.version + 1 then raise exception 'stale_version' using errcode = '40001'; end if;
  if new.status <> old.status and not exists (select 1 from finance.order_transitions where from_status = old.status and to_status = new.status) then
    raise exception 'illegal transition % -> %', old.status, new.status;
  end if;
  -- R-070: never pay an account finance has not acknowledged.
  if new.status = 'executed' and not exists (select 1 from finance.bank_accounts b where b.tenant_id = new.tenant_id and b.id = new.bank_account_id and b.status = 'acknowledged') then
    raise exception 'bank_account_not_acknowledged';
  end if;
  return new;
end $$;
create trigger guard before update on finance.disbursement_orders for each row execute function finance.guard_order();
alter table finance.disbursement_orders enable row level security;
create policy do_read on finance.disbursement_orders for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_staff()) or association_id = any(coalesce((select app.org_ids()), '{}'))));
create policy do_write on finance.disbursement_orders for all to authenticated
  using (tenant_id = (select app.tenant()) and ((select app.is_staff()) or (select app.is_system()) or association_id = any(coalesce((select app.org_ids()), '{}'))))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on finance.disbursement_orders to authenticated;
create trigger audit after insert or update on finance.disbursement_orders for each row execute function kernel.audit_row();

-- ── supplier orders (R-060–R-062)
create table finance.supplier_orders (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  ref text not null,
  supplier_id uuid not null,
  application_id uuid not null,
  association_id uuid not null,
  item text not null,
  quantity int not null check (quantity > 0),
  amount_halalas bigint not null check (amount_halalas > 0),
  status text not null default 'issued' check (status in ('issued','supplier_confirmed','association_confirmed','delivered','disputed','paid')),
  supplier_proof_file_id uuid,
  supplier_confirmed_qty int,
  association_confirmed_qty int,
  version int not null default 1,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, ref),
  foreign key (tenant_id, supplier_id) references org.suppliers (tenant_id, id),
  foreign key (tenant_id, application_id) references cycle.applications (tenant_id, id)
);
alter table finance.supplier_orders enable row level security;
create policy so_read on finance.supplier_orders for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_staff()) or supplier_id = any(coalesce((select app.org_ids()), '{}')) or association_id = any(coalesce((select app.org_ids()), '{}'))));
create policy so_write on finance.supplier_orders for all to authenticated
  using (tenant_id = (select app.tenant()) and ((select app.is_staff()) or (select app.is_system()) or supplier_id = any(coalesce((select app.org_ids()), '{}')) or association_id = any(coalesce((select app.org_ids()), '{}'))))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on finance.supplier_orders to authenticated;
create trigger audit after insert or update on finance.supplier_orders for each row execute function kernel.audit_row();

-- R-081: what finance may read about an application is limited to the payment data.
-- Finance has no policy on cycle.applications, so this definer view is its one window.
create or replace view finance.payment_context as
  select p.tenant_id, p.id as project_id, p.ref as project_ref, a.name as association_name, a.id as association_id,
         p.approved_halalas, p.status as project_status
  from project.projects p join org.associations a on a.tenant_id = p.tenant_id and a.id = p.association_id
  where p.tenant_id = app.tenant() and app.has_any(array['finance','executive','grants_manager','system_admin']);
grant select on finance.payment_context to authenticated;
