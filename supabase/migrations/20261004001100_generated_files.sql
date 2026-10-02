-- Platform-generated documents (agreements, letters, exports) are trusted output, not
-- uploads: they skip quarantine. Only staff (or the worker) may create them.
create or replace function kernel.system_file(p_id uuid, p_path text, p_name text, p_mime text, p_size bigint, p_owner_org uuid, p_text text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (app.is_staff() or app.is_system()) then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into kernel.files (tenant_id, id, storage_path, name, mime, size_bytes, sha256, scan_status, owner_org_id, uploaded_by, text_content)
  values (app.tenant(), p_id, p_path, p_name, p_mime, p_size, 'generated', 'clean', p_owner_org, auth.uid(), p_text);
end $$;
revoke all on function kernel.system_file(uuid,text,text,text,bigint,uuid,text) from public, anon;
grant execute on function kernel.system_file(uuid,text,text,text,bigint,uuid,text) to authenticated;
