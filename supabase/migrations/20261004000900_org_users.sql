-- T-23 · R-012 / R-092: the association owner adds a user, after a step-up code.
-- persons/credentials are not writable by a session, so this definer function is
-- the single door, and it re-checks both conditions itself.
create or replace function iam.add_org_user(p_person uuid, p_name text, p_email text, p_phone text, p_hash text, p_role text, p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t uuid := app.tenant();
begin
  if t is null then raise exception 'no tenant'; end if;
  if p_role not in ('assoc_applicant','assoc_coordinator') then raise exception 'role not delegable' using errcode = '42501'; end if;
  if not exists (select 1 from iam.memberships m where m.tenant_id = t and m.person_id = auth.uid() and m.role = 'assoc_owner' and m.org_id = p_org and m.active) then
    raise exception 'only the account owner adds users' using errcode = '42501';
  end if;
  if not exists (select 1 from iam.otp_challenges c where c.tenant_id = t and c.purpose = 'delegation' and c.subject = p_org::text and c.consumed_at > now() - interval '15 minutes') then
    raise exception 'otp_required' using errcode = 'P0001';
  end if;
  insert into iam.persons (id, full_name, email, phone) values (p_person, p_name, p_email, p_phone);
  insert into iam.credentials (person_id, email, password_hash) values (p_person, p_email, p_hash);
  insert into iam.memberships (tenant_id, person_id, role, org_id, granted_by) values (t, p_person, p_role, p_org, auth.uid());
end $$;
revoke all on function iam.add_org_user(uuid,text,text,text,text,text,uuid) from public, anon;
grant execute on function iam.add_org_user(uuid,text,text,text,text,text,uuid) to authenticated;

-- Staff user creation by the system admin (R-001 users step). Same single-door pattern.
create or replace function iam.add_staff_user(p_person uuid, p_name text, p_email text, p_phone text, p_hash text, p_role text, p_manager uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t uuid := app.tenant();
begin
  if not app.has_role('system_admin') then raise exception 'only a system admin adds staff' using errcode = '42501'; end if;
  if p_role not in ('grants_specialist','grants_manager','committee_secretary','finance','executive','system_admin','external_reviewer') then raise exception 'bad role'; end if;
  insert into iam.persons (id, full_name, email, phone) values (p_person, p_name, p_email, p_phone) on conflict (id) do nothing;
  insert into iam.credentials (person_id, email, password_hash) values (p_person, p_email, p_hash) on conflict (person_id) do nothing;
  insert into iam.memberships (tenant_id, person_id, role, manager_person_id, granted_by) values (t, p_person, p_role, p_manager, auth.uid());
end $$;
revoke all on function iam.add_staff_user(uuid,text,text,text,text,text,uuid) from public, anon;
grant execute on function iam.add_staff_user(uuid,text,text,text,text,text,uuid) to authenticated;
