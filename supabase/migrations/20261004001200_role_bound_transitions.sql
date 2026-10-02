-- Defense in depth: an association may write its own deliverables, amendments,
-- final reports and agreements (to submit, respond, sign), but the DECISIONS on
-- them belong to the donor's staff. These triggers refuse a decision written by
-- anyone else, whatever the row policy allows.
create or replace function project.deliverable_decision_guard() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status in ('accepted','returned','rejected') and not (app.is_program_staff() or app.is_system()) then
    raise exception 'only staff decide a deliverable' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace function project.final_report_decision_guard() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status in ('accepted','returned') and not (app.is_program_staff() or app.is_system()) then
    raise exception 'only staff decide a final report' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace function project.amendment_decision_guard() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status in ('in_approval','approved','awaiting_signatory') and not (app.is_program_staff() or app.is_system())
     and not (old.status = 'awaiting_signatory' and new.status = 'approved' and new.signatory_response = 'accepted') then
    raise exception 'only staff move an amendment through approval' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace function project.agreement_signature_guard() returns trigger language plpgsql as $$
begin
  if (new.donor_signed_at is distinct from old.donor_signed_at or new.donor_signed_by is distinct from old.donor_signed_by)
     and not (app.has_any(array['executive','grants_manager','system_admin']) or app.is_system()) then
    raise exception 'only the donor signs for the donor' using errcode = '42501';
  end if;
  if new.association_signed_at is distinct from old.association_signed_at and old.association_signed_at is not null then
    raise exception 'a signature is not rewritten' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger decision_guard before update on project.deliverables for each row execute function project.deliverable_decision_guard();
create trigger decision_guard before update on project.final_reports for each row execute function project.final_report_decision_guard();
create trigger decision_guard before update on project.amendments for each row execute function project.amendment_decision_guard();
create trigger signature_guard before update on project.agreements for each row execute function project.agreement_signature_guard();

-- Disbursement orders: staff and the worker write them; an association only uploads a receipt, through this door.
drop policy do_write on finance.disbursement_orders;
create policy do_write on finance.disbursement_orders for all to authenticated
  using (tenant_id = (select app.tenant()) and ((select app.is_staff()) or (select app.is_system())))
  with check (tenant_id = (select app.tenant()));
create or replace function finance.upload_receipt(p_order uuid, p_file uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update finance.disbursement_orders o set receipt_file_id = p_file, receipt_received_at = now(), version = version + 1
  where o.tenant_id = app.tenant() and o.id = p_order and o.status = 'executed' and o.receipt_received_at is null
    and o.association_id = any(coalesce(app.org_ids(), '{}'))
    and exists (select 1 from kernel.files f where f.tenant_id = o.tenant_id and f.id = p_file and f.owner_org_id = o.association_id);
  if not found then raise exception 'receipt not accepted' using errcode = '42501'; end if;
end $$;
grant execute on function finance.upload_receipt(uuid, uuid) to authenticated;

-- Associations: only staff (or the worker) may change status / suspension.
drop policy assoc_staff_update on org.associations;
create policy assoc_staff_update on org.associations for update to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.has_any(array['system_admin','grants_manager','grants_specialist'])) or (select app.is_system())))
  with check (tenant_id = (select app.tenant()));

-- Bank accounts: every staff role may see that an account exists (last 4 digits only, via column grants);
-- the encrypted IBAN is never granted to any session.
drop policy bank_read on finance.bank_accounts;
create policy bank_read on finance.bank_accounts for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_staff()) or (select app.is_system()) or association_id = any(coalesce((select app.org_ids()), '{}'))));
