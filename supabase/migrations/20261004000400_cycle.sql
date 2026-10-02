-- T-12 · T-26–T-36 · cycle: applications, custody, study files, AI outputs, invitations.

create table cycle.applications (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  ref text,                                    -- ط-YYYY-NNNN, assigned at submission (R-022)
  association_id uuid not null,
  program_id text not null,                    -- id inside the framework snapshot
  framework_version_id uuid not null,          -- R-087 / invariant 5: pinned at creation, re-pinned at submit
  track text,                                  -- R-117
  study_mode text not null default 'manih_first' check (study_mode in ('manih_first','independent')),
  status text not null default 'draft' check (status in (
    'draft','submitted','in_review','awaiting_info','in_approval','approved','rejected','withdrawn','agreement','project')),
  version int not null default 1,
  title text not null default '',
  form_data jsonb not null default '{}'::jsonb,
  requested_halalas bigint check (requested_halalas is null or requested_halalas >= 0),
  approved_halalas bigint check (approved_halalas is null or approved_halalas >= 0),
  catalog_item_id text,
  quantity int,
  invitation_id uuid,
  assignee_membership_id uuid,
  due_at timestamptz,
  sla_breached_at timestamptz,
  submitted_at timestamptz,
  decided_at timestamptz,
  decision text check (decision in ('approved','rejected')),
  created_by uuid references iam.persons(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, ref),
  foreign key (tenant_id, association_id) references org.associations (tenant_id, id),
  foreign key (tenant_id, framework_version_id) references framework.versions (tenant_id, id),
  foreign key (tenant_id, assignee_membership_id) references iam.memberships (tenant_id, id),
  -- R-024: nothing past draft is ever unassigned.
  check (status in ('draft','withdrawn') or assignee_membership_id is not null),
  check (status = 'draft' or ref is not null)
);
create index applications_status_idx on cycle.applications (tenant_id, status);
create index applications_assoc_idx on cycle.applications (tenant_id, association_id);
create index applications_assignee_idx on cycle.applications (tenant_id, assignee_membership_id) where status not in ('draft','withdrawn','rejected','project');

-- The fixed state machine (invariant 7, architecture §5), enforced again in the database.
create table cycle.application_transitions (from_status text not null, to_status text not null, primary key (from_status, to_status));
insert into cycle.application_transitions values
  ('draft','submitted'), ('submitted','in_review'), ('in_review','awaiting_info'), ('awaiting_info','in_review'),
  ('in_review','in_approval'), ('in_approval','in_review'), ('in_approval','approved'), ('in_approval','rejected'),
  ('approved','agreement'), ('agreement','project'), ('submitted','withdrawn'), ('in_review','withdrawn'), ('awaiting_info','withdrawn');
grant select on cycle.application_transitions to authenticated;

create or replace function cycle.guard_application() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.version <> old.version + 1 then
      raise exception 'stale_version' using errcode = '40001';
    end if;
    if new.status <> old.status and not exists (select 1 from cycle.application_transitions where from_status = old.status and to_status = new.status) then
      raise exception 'illegal transition % -> %', old.status, new.status using errcode = 'P0001';
    end if;
    -- The framework version is fixed once submitted (invariant 5).
    if old.status <> 'draft' and new.framework_version_id <> old.framework_version_id then
      raise exception 'framework version is pinned after submission';
    end if;
    if old.status <> 'draft' and (new.form_data <> old.form_data or new.requested_halalas is distinct from old.requested_halalas) and old.status <> 'awaiting_info' then
      raise exception 'submitted content changes only through an info request';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger guard before update on cycle.applications for each row execute function cycle.guard_application();
create trigger audit after insert or update on cycle.applications for each row execute function kernel.audit_row();

alter table cycle.applications enable row level security;
create policy app_staff_read on cycle.applications for select to authenticated using (
  tenant_id = (select app.tenant()) and (
    (select app.is_program_staff())
    or association_id = any(coalesce((select app.org_ids()), '{}'))
    or id = any(coalesce((select app.reviewer_scope()), '{}'))));
create policy app_assoc_insert on cycle.applications for insert to authenticated with check (
  tenant_id = (select app.tenant()) and status = 'draft' and association_id = any(coalesce((select app.org_ids()), '{}'))
  and (select app.has_any(array['assoc_owner','assoc_applicant'])) and created_by = auth.uid());
create policy app_assoc_update on cycle.applications for update to authenticated using (
  tenant_id = (select app.tenant()) and association_id = any(coalesce((select app.org_ids()), '{}'))
  and (select app.has_any(array['assoc_owner','assoc_applicant'])) and status in ('draft','submitted','in_review','awaiting_info'))
  with check (tenant_id = (select app.tenant()) and status in ('draft','submitted','awaiting_info','in_review','withdrawn'));
create policy app_staff_update on cycle.applications for update to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.has_any(array['grants_specialist','grants_manager','committee_secretary','executive','system_admin'])) or (select app.is_system())))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on cycle.applications to authenticated;

-- Application reference numbers: one sequence per donor and year.
create table cycle.ref_counters (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  scope text not null,
  year int not null,
  last int not null default 0,
  primary key (tenant_id, id),
  unique (tenant_id, scope, year)
);
alter table cycle.ref_counters enable row level security;
revoke all on cycle.ref_counters from public, anon, authenticated;
create or replace function cycle.next_ref(p_scope text, p_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.tenant(); y int := extract(year from now() at time zone 'Asia/Riyadh')::int; n int;
begin
  if t is null then raise exception 'no tenant'; end if;
  insert into cycle.ref_counters (tenant_id, scope, year, last) values (t, p_scope, y, 1)
  on conflict (tenant_id, scope, year) do update set last = cycle.ref_counters.last + 1
  returning last into n;
  return p_prefix || '-' || y::text || '-' || lpad(n::text, 4, '0');
end $$;
grant execute on function cycle.next_ref(text, text) to authenticated;

-- ── Custody (R-024, R-027, R-028): who held the application, from when to when.
create table cycle.custody (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  application_id uuid not null,
  membership_id uuid not null,
  from_at timestamptz not null default now(),
  to_at timestamptz,
  reason text not null,                 -- 'auto' for automatic assignment; mandatory text for a reassignment
  handover_note text,
  assigned_by uuid references iam.persons(id),
  primary key (tenant_id, id),
  foreign key (tenant_id, application_id) references cycle.applications (tenant_id, id),
  foreign key (tenant_id, membership_id) references iam.memberships (tenant_id, id),
  check (length(btrim(reason)) > 0),
  check (to_at is null or to_at >= from_at)
);
create unique index custody_open_idx on cycle.custody (tenant_id, application_id) where to_at is null;
alter table cycle.custody enable row level security;
create policy custody_read on cycle.custody for select to authenticated using (tenant_id = (select app.tenant()) and (select app.is_program_staff()));
create policy custody_write on cycle.custody for all to authenticated
  using (tenant_id = (select app.tenant()) and ((select app.has_any(array['grants_manager','system_admin','grants_specialist'])) or (select app.is_system())))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update (to_at) on cycle.custody to authenticated;
create trigger audit after insert or update on cycle.custody for each row execute function kernel.audit_row();

-- N-08: a conflict-of-interest declaration blocks assignment to that person.
create table cycle.coi_declarations (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  application_id uuid not null,
  membership_id uuid not null,
  note text,
  declared_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, application_id, membership_id),
  foreign key (tenant_id, application_id) references cycle.applications (tenant_id, id),
  foreign key (tenant_id, membership_id) references iam.memberships (tenant_id, id)
);
alter table cycle.coi_declarations enable row level security;
create policy coi_rw on cycle.coi_declarations for all to authenticated
  using (tenant_id = (select app.tenant()) and (select app.is_program_staff()))
  with check (tenant_id = (select app.tenant()) and membership_id = any(coalesce((select app.membership_ids()), '{}')));
grant select, insert on cycle.coi_declarations to authenticated;
create trigger audit after insert on cycle.coi_declarations for each row execute function kernel.audit_row();

-- ── AI outputs (invariant 8, docs/02-ai-layer.md §7): immutable once settled.
create table cycle.ai_outputs (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  task text not null,
  schema_version text not null default '1',
  subject_kind text not null,
  subject_id uuid not null,
  status text not null default 'pending' check (status in ('pending','ready','failed','disabled')),
  idempotency_key text not null,
  manih_task_id text,
  framework_version_id uuid,
  input_hash text not null,
  model text,
  package_version text,
  output jsonb,                      -- the non-sealed part (summary, budget flags, schedule…)
  evidence jsonb not null default '[]'::jsonb,
  error text,
  cost_usd numeric(10,4),
  latency_ms int,
  attempts int not null default 0,
  requested_by uuid,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  primary key (tenant_id, id),
  unique (tenant_id, idempotency_key)
);
create index ai_outputs_subject_idx on cycle.ai_outputs (tenant_id, subject_kind, subject_id, task, created_at desc);
create or replace function cycle.ai_output_immutable() returns trigger language plpgsql as $$
begin
  if old.status in ('ready','failed','disabled') then
    raise exception 'ai_output is immutable once settled (invariant 8)';
  end if;
  return new;
end $$;
create trigger immutable before update on cycle.ai_outputs for each row execute function cycle.ai_output_immutable();
create trigger no_delete before delete on cycle.ai_outputs for each statement execute function kernel.audit_immutable();
alter table cycle.ai_outputs enable row level security;
create policy ai_read on cycle.ai_outputs for select to authenticated using (
  tenant_id = (select app.tenant()) and (
    (select app.is_program_staff())
    -- associations see only the extractions run on their own uploads
    or (task in ('document.extract','proposal.prefill') and requested_by = auth.uid())));
create policy ai_insert on cycle.ai_outputs for insert to authenticated with check (tenant_id = (select app.tenant()) and status in ('pending','disabled'));
create policy ai_settle on cycle.ai_outputs for update to authenticated
  using (tenant_id = (select app.tenant()) and ((select app.is_system()) or requested_by = auth.uid()))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on cycle.ai_outputs to authenticated;

-- R-039: the sealed half of a study file — scores and recommendation. Readable only after the
-- reading specialist has recorded their own assessment, or when the mode is Manih-first.
-- The hiding is HERE, in the database, not in the UI.
create table cycle.ai_sealed (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  ai_output_id uuid not null,
  application_id uuid not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, ai_output_id),
  foreign key (tenant_id, ai_output_id) references cycle.ai_outputs (tenant_id, id),
  foreign key (tenant_id, application_id) references cycle.applications (tenant_id, id)
);
create trigger no_change before update or delete on cycle.ai_sealed for each statement execute function kernel.audit_immutable();

create table cycle.assessments (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  application_id uuid not null,
  person_id uuid not null references iam.persons(id),
  scores jsonb not null,             -- {criterion: score}
  recorded_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, application_id, person_id),
  foreign key (tenant_id, application_id) references cycle.applications (tenant_id, id)
);
alter table cycle.assessments enable row level security;
create policy assess_rw on cycle.assessments for all to authenticated
  using (tenant_id = (select app.tenant()) and (select app.is_program_staff()))
  with check (tenant_id = (select app.tenant()) and person_id = auth.uid());
grant select, insert on cycle.assessments to authenticated;
create trigger audit after insert on cycle.assessments for each row execute function kernel.audit_row();

create or replace function cycle.sealed_visible(p_application uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from cycle.applications a
    where a.tenant_id = app.tenant() and a.id = p_application and (
      a.study_mode = 'manih_first'
      or exists (select 1 from cycle.assessments s where s.tenant_id = a.tenant_id and s.application_id = a.id and s.person_id = auth.uid())
      or app.has_any(array['grants_manager','executive','committee_secretary'])))
$$;
alter table cycle.ai_sealed enable row level security;
create policy sealed_read on cycle.ai_sealed for select to authenticated using (
  tenant_id = (select app.tenant()) and (select app.is_program_staff()) and cycle.sealed_visible(application_id));
create policy sealed_insert on cycle.ai_sealed for insert to authenticated with check (tenant_id = (select app.tenant()) and (select app.is_system()));
grant select, insert on cycle.ai_sealed to authenticated;

-- N-11: feedback on any AI output.
create table cycle.ai_feedback (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  ai_output_id uuid not null,
  person_id uuid not null references iam.persons(id),
  helpful boolean not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, ai_output_id, person_id),
  foreign key (tenant_id, ai_output_id) references cycle.ai_outputs (tenant_id, id)
);
alter table cycle.ai_feedback enable row level security;
create policy fb_rw on cycle.ai_feedback for all to authenticated
  using (tenant_id = (select app.tenant()) and ((select app.is_staff()) or person_id = auth.uid()))
  with check (tenant_id = (select app.tenant()) and person_id = auth.uid());
grant select, insert, update on cycle.ai_feedback to authenticated;

-- ── The specialist's judgement (R-034, R-036, R-038): a separate record pointing at the AI output.
create table cycle.study_files (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  application_id uuid not null,
  summary text,
  scores jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '[]'::jsonb,
  recommendation text check (recommendation in ('approve','approve_modified','reject')),
  recommended_halalas bigint check (recommended_halalas is null or recommended_halalas >= 0),
  rationale text,
  study_output_id uuid,
  judged_by uuid references iam.persons(id),
  judged_at timestamptz,
  version int not null default 1,
  primary key (tenant_id, id),
  unique (tenant_id, application_id),
  foreign key (tenant_id, application_id) references cycle.applications (tenant_id, id),
  -- R-038: no recommendation without a judgement recorded in a specialist's name.
  check (recommendation is null or (judged_by is not null and judged_at is not null and rationale is not null))
);
alter table cycle.study_files enable row level security;
create policy sf_read on cycle.study_files for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_program_staff()) or application_id = any(coalesce((select app.reviewer_scope()), '{}'))));
create policy sf_write on cycle.study_files for all to authenticated
  using (tenant_id = (select app.tenant()) and (select app.has_any(array['grants_specialist','grants_manager'])))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update on cycle.study_files to authenticated;
create trigger audit after insert or update on cycle.study_files for each row execute function kernel.audit_row();

-- ── Info requests (R-032, N-07)
create table cycle.info_requests (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  application_id uuid not null,
  items jsonb not null,
  message text not null,
  draft_output_id uuid,
  status text not null default 'open' check (status in ('open','answered','cancelled')),
  sent_by uuid not null references iam.persons(id),
  sent_at timestamptz not null default now(),
  answered_at timestamptz,
  answer_note text,
  primary key (tenant_id, id),
  foreign key (tenant_id, application_id) references cycle.applications (tenant_id, id)
);
alter table cycle.info_requests enable row level security;
create policy ir_read on cycle.info_requests for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_program_staff()) or exists (
    select 1 from cycle.applications a where a.tenant_id = info_requests.tenant_id and a.id = info_requests.application_id and a.association_id = any(coalesce((select app.org_ids()), '{}')))));
create policy ir_staff on cycle.info_requests for insert to authenticated with check (
  tenant_id = (select app.tenant()) and sent_by = auth.uid() and (select app.has_any(array['grants_specialist','grants_manager'])));
create policy ir_answer on cycle.info_requests for update to authenticated using (
  tenant_id = (select app.tenant()) and exists (
    select 1 from cycle.applications a where a.tenant_id = info_requests.tenant_id and a.id = info_requests.application_id and a.association_id = any(coalesce((select app.org_ids()), '{}'))))
  with check (tenant_id = (select app.tenant()));
grant select, insert, update (status, answered_at, answer_note) on cycle.info_requests to authenticated;
create trigger audit after insert or update on cycle.info_requests for each row execute function kernel.audit_row();

-- ── Invitations (R-021): invitees never see one another.
create table cycle.invitations (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  program_id text not null,
  association_id uuid not null,
  deadline timestamptz not null,
  status text not null default 'sent' check (status in ('sent','accepted','declined','expired')),
  invited_by uuid not null references iam.persons(id),
  fit_output_id uuid,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (tenant_id, id),
  unique (tenant_id, program_id, association_id),
  foreign key (tenant_id, association_id) references org.associations (tenant_id, id)
);
alter table cycle.invitations enable row level security;
create policy inv_read on cycle.invitations for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_program_staff()) or association_id = any(coalesce((select app.org_ids()), '{}'))));
create policy inv_staff on cycle.invitations for insert to authenticated with check (
  tenant_id = (select app.tenant()) and invited_by = auth.uid() and (select app.has_any(array['grants_manager','system_admin'])));
create policy inv_respond on cycle.invitations for update to authenticated using (
  tenant_id = (select app.tenant()) and association_id = any(coalesce((select app.org_ids()), '{}')) and status = 'sent')
  with check (tenant_id = (select app.tenant()) and status in ('accepted','declined'));
grant select, insert, update (status, responded_at) on cycle.invitations to authenticated;
create trigger audit after insert or update on cycle.invitations for each row execute function kernel.audit_row();
