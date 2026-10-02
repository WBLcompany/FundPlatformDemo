-- T-53 · T-55 · search index with Arabic normalisation (D-10), reporting views (R-104–R-107).

-- Arabic normalisation: strip diacritics and tatweel, unify alef/ya/ta-marbuta/hamza seats,
-- fold Arabic-Indic digits. The same rules as packages/kernel/src/search (asserted by a test).
create or replace function app.normalize_ar(t text) returns text language sql immutable parallel safe as $$
  select lower(translate(
    regexp_replace(coalesce(t, ''), '[ً-ٰٟـ]', '', 'g'),
    'أإآٱىةؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    'اااايهوي01234567890123456789'))
$$;

create table kernel.search_index (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  entity_kind text not null,
  entity_id uuid not null,
  ref text,
  title text not null,
  subtitle text,
  norm text not null,
  visibility text not null check (visibility in ('program_staff','staff')),
  org_id uuid,                          -- the association/supplier that may also see it
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, entity_kind, entity_id)
);
create index search_trgm_idx on kernel.search_index using gin (norm gin_trgm_ops);
alter table kernel.search_index enable row level security;
-- R-099: no result outside the caller's permission.
create policy search_read on kernel.search_index for select to authenticated using (
  tenant_id = (select app.tenant()) and (
    (visibility = 'program_staff' and (select app.is_program_staff()))
    or (visibility = 'staff' and (select app.is_staff()))
    or (org_id is not null and org_id = any(coalesce((select app.org_ids()), '{}')))));
grant select on kernel.search_index to authenticated;

create or replace function kernel.index_upsert(p_tenant uuid, p_kind text, p_id uuid, p_ref text, p_title text, p_sub text, p_vis text, p_org uuid)
returns void language sql security definer set search_path = '' as $$
  insert into kernel.search_index (tenant_id, entity_kind, entity_id, ref, title, subtitle, norm, visibility, org_id, updated_at)
  values (p_tenant, p_kind, p_id, p_ref, p_title, p_sub, app.normalize_ar(coalesce(p_ref,'') || ' ' || p_title || ' ' || coalesce(p_sub,'')), p_vis, p_org, now())
  on conflict (tenant_id, entity_kind, entity_id) do update set ref = excluded.ref, title = excluded.title, subtitle = excluded.subtitle,
    norm = excluded.norm, visibility = excluded.visibility, org_id = excluded.org_id, updated_at = now()
$$;

create or replace function kernel.index_application() returns trigger language plpgsql security definer set search_path = '' as $$
declare an text;
begin
  if new.status = 'draft' then return new; end if;
  select name into an from org.associations where tenant_id = new.tenant_id and id = new.association_id;
  perform kernel.index_upsert(new.tenant_id, 'application', new.id, new.ref, new.title, an, 'program_staff', new.association_id);
  return new;
end $$;
create trigger search_index after insert or update on cycle.applications for each row execute function kernel.index_application();

create or replace function kernel.index_association() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform kernel.index_upsert(new.tenant_id, 'association', new.id, new.license_no, new.name, new.city, 'staff', new.id);
  return new;
end $$;
create trigger search_index after insert or update on org.associations for each row execute function kernel.index_association();

create or replace function kernel.index_project() returns trigger language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  select title into t from cycle.applications where tenant_id = new.tenant_id and id = new.application_id;
  perform kernel.index_upsert(new.tenant_id, 'project', new.id, new.ref, coalesce(t, new.ref), null, 'staff', new.association_id);
  return new;
end $$;
create trigger search_index after insert or update on project.projects for each row execute function kernel.index_project();

-- ── reporting (read-only views, security_invoker so RLS applies to the reader)
create or replace view reporting.pipeline with (security_invoker = true) as
  select tenant_id, program_id, status, count(*) as applications, coalesce(sum(requested_halalas), 0) as requested_halalas
  from cycle.applications where status <> 'draft' group by tenant_id, program_id, status;

-- R-104: totals must equal the disbursement records.
create or replace view reporting.disbursements with (security_invoker = true) as
  select o.tenant_id, o.id as order_id, o.ref, o.project_id, o.association_id, o.amount_halalas, o.status, o.executed_at, o.finance_ref,
         p.program_id, p.waqf_category, date_trunc('month', o.executed_at at time zone 'Asia/Riyadh') as month
  from finance.disbursement_orders o join project.projects p on p.tenant_id = o.tenant_id and p.id = o.project_id;

-- R-105: every grant attributed to a waqf deed category.
create or replace view reporting.waqf_alignment with (security_invoker = true) as
  select p.tenant_id, coalesce(p.waqf_category, 'غير منسوب') as waqf_category, count(*) as grants, sum(p.approved_halalas) as approved_halalas
  from project.projects p group by p.tenant_id, coalesce(p.waqf_category, 'غير منسوب');

-- R-106: outputs summed from final reports' unified numeric fields.
create or replace view reporting.outputs with (security_invoker = true) as
  select f.tenant_id, p.program_id, count(*) as reports, sum(f.beneficiaries) as beneficiaries,
         sum(coalesce(f.female_beneficiaries, 0)) as female_beneficiaries, sum(f.spent_halalas) as spent_halalas
  from project.final_reports f join project.projects p on p.tenant_id = f.tenant_id and p.id = f.project_id
  where f.status = 'accepted' group by f.tenant_id, p.program_id;

grant select on all tables in schema reporting to authenticated;
