#!/bin/sh
# Restore a backup made by backup.sh into an EMPTY database on any server.
#   ./restore.sh /backups/20261003-020000
# Needs PGHOST PGUSER PGPASSWORD (a superuser), PGDATABASE (the target, created if missing),
# AUTHENTICATOR_PASSWORD, and STORAGE_ROOT for the files.
set -eu
src="$1"
( cd "$src" && sha256sum -c SHA256SUMS )
# Roles first: every grant in the dump names them. Existing roles are kept ("already exists" is fine).
psql -v ON_ERROR_STOP=0 -q -d postgres -f "$src/roles.sql" 2>&1 | grep -v "already exists" || true
psql -v ON_ERROR_STOP=1 -q -d postgres -tc "select 1 from pg_database where datname = '$PGDATABASE'" | grep -q 1 \
  || psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database \"$PGDATABASE\""
if [ "$(psql -tAc "select count(*) from pg_namespace where nspname = 'platform'")" != "0" ]; then
  echo "refusing: $PGDATABASE is not empty"; exit 1
fi
pg_restore --exit-on-error --dbname="$PGDATABASE" "$src/db.dump"
psql -v ON_ERROR_STOP=1 -q -c "alter role authenticator with login password '$AUTHENTICATOR_PASSWORD'"
if [ -f "$src/storage.tar.gz" ]; then mkdir -p "$STORAGE_ROOT" && tar -C "$STORAGE_ROOT" -xzf "$src/storage.tar.gz"; fi
# The restored audit chain must verify for every donor (R-095).
broken=$(psql -tAc "select count(*) from platform.donors d where kernel.verify_audit_chain(d.id) is not null")
[ "$broken" = "0" ] || { echo "restored audit chain does not verify for $broken donor(s)"; exit 1; }
echo "restore ok: $PGDATABASE"
