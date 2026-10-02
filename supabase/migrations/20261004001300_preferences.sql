-- R-082: personal preferences (e.g. the executive's home order), per person per tenant.
create table kernel.preferences (
  tenant_id uuid not null references platform.donors(id),
  id uuid not null default gen_random_uuid(),
  person_id uuid not null references iam.persons(id),
  key text not null,
  value jsonb not null,
  primary key (tenant_id, id),
  unique (tenant_id, person_id, key)
);
alter table kernel.preferences enable row level security;
create policy prefs_own on kernel.preferences for all to authenticated
  using (tenant_id = (select app.tenant()) and person_id = auth.uid())
  with check (tenant_id = (select app.tenant()) and person_id = auth.uid());
grant select, insert, update on kernel.preferences to authenticated;
