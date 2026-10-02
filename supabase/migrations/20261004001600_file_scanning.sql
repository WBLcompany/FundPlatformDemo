-- T-24 · uploads land in quarantine and are served only once clean (architecture §8).
-- The worker scans them as the restricted `system` claim scoped to one tenant; it must be able to
-- read the rows it updates. Tenant isolation is unchanged: app.tenant() still bounds every row.
drop policy files_read on kernel.files;
create policy files_read on kernel.files for select to authenticated using (
  tenant_id = (select app.tenant()) and ((select app.is_staff()) or (select app.is_system()) or owner_org_id = any(coalesce((select app.org_ids()), '{}'))));
create index files_quarantine_idx on kernel.files (tenant_id, created_at) where scan_status = 'quarantine';
