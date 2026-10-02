-- T-29 · R-024: an association submitting cannot see the donor's staff, yet the
-- application must have an assignee the moment it arrives. This definer function
-- hands the submitter the anonymous facts the assignment rule needs (load,
-- absence, conflicts) for THEIR OWN application only; the choice itself stays in
-- packages/domain (cycle.pickAssignee).
create or replace function cycle.assignment_candidates(p_application uuid)
returns table (membership_id uuid, person_id uuid, open_load int, absent_from text, absent_until text, active boolean, conflicted boolean)
language sql stable security definer set search_path = '' as $$
  select m.id, m.person_id,
    (select count(*)::int from cycle.applications a where a.tenant_id = m.tenant_id and a.assignee_membership_id = m.id and a.status in ('submitted','in_review','awaiting_info','in_approval')),
    to_char(m.absent_from, 'YYYY-MM-DD'), to_char(m.absent_until, 'YYYY-MM-DD'), m.active,
    exists (select 1 from cycle.coi_declarations c where c.tenant_id = m.tenant_id and c.application_id = p_application and c.membership_id = m.id)
  from iam.memberships m
  where m.tenant_id = app.tenant() and m.role = 'grants_specialist' and m.active
    and exists (select 1 from cycle.applications x where x.tenant_id = app.tenant() and x.id = p_application
      and (x.association_id = any(coalesce(app.org_ids(), '{}')) or app.is_program_staff()))
$$;
grant execute on function cycle.assignment_candidates(uuid) to authenticated;

-- The automatic custody row written at submission by the submitting association.
create policy custody_auto_on_submit on cycle.custody for insert to authenticated with check (
  tenant_id = (select app.tenant()) and reason = 'auto' and exists (
    select 1 from cycle.applications a where a.tenant_id = custody.tenant_id and a.id = custody.application_id
      and a.association_id = any(coalesce((select app.org_ids()), '{}')) and a.status = 'submitted' and a.assignee_membership_id = custody.membership_id));
