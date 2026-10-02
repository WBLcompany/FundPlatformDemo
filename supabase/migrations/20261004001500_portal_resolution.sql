-- R-109: each donor's portal is served on its own subdomain. Resolving the host to a
-- tenant happens before any session exists, so this definer function returns the
-- public identity of ONE donor by subdomain and nothing else.
create or replace function platform.resolve_portal(p_subdomain text)
returns table (id uuid, name text, slug text, status text)
language sql stable security definer set search_path = '' as $$
  select d.id, d.name, d.slug, d.status from platform.donors d where d.subdomain = lower(p_subdomain)
$$;
revoke all on function platform.resolve_portal(text) from public;
grant execute on function platform.resolve_portal(text) to anon, authenticated;

-- The second factor is checked after the password, before a full session exists.
create or replace function iam.mfa_for(p_person uuid) returns table (mfa_secret text)
language sql stable security definer set search_path = '' as $$
  select m.secret_enc from iam.mfa m where m.person_id = p_person
$$;
revoke all on function iam.mfa_for(uuid) from public;
grant execute on function iam.mfa_for(uuid) to anon;

-- R-011: the letter uploaded during registration (anon, no account yet) lands in quarantine.
create or replace function kernel.anon_letter_file(p_id uuid, p_path text, p_name text, p_mime text, p_size bigint, p_sha text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if app.tenant() is null then raise exception 'no tenant'; end if;
  if p_size > 10 * 1024 * 1024 then raise exception 'file too large'; end if;
  if p_path not like app.tenant()::text || '/letters/%' then raise exception 'bad path'; end if;
  insert into kernel.files (tenant_id, id, storage_path, name, mime, size_bytes, sha256, scan_status)
  values (app.tenant(), p_id, p_path, p_name, p_mime, p_size, p_sha, 'quarantine');
end $$;
revoke all on function kernel.anon_letter_file(uuid,text,text,text,bigint,text) from public;
grant execute on function kernel.anon_letter_file(uuid,text,text,text,bigint,text) to anon;
