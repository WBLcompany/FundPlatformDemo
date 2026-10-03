#!/bin/sh
# Daily backup (R-116): the database (custom format), the cluster roles it depends on (without
# passwords), and the file store. Keeps BACKUP_KEEP_DAYS (default 30). Run by the `backup` service.
#   PGHOST PGUSER PGPASSWORD PGDATABASE  — the database
#   STORAGE_ROOT                         — the file store shared by web and worker
#   BACKUP_DIR                           — where backups go (mount it on a different disk)
set -eu
stamp=$(date -u +%Y%m%d-%H%M%S)
dir="${BACKUP_DIR:-/backups}/$stamp"
mkdir -p "$dir"
pg_dumpall --roles-only --no-role-passwords > "$dir/roles.sql"
pg_dump --format=custom --file="$dir/db.dump" "$PGDATABASE"
if [ -d "${STORAGE_ROOT:-/data/storage}" ]; then tar -C "${STORAGE_ROOT:-/data/storage}" -czf "$dir/storage.tar.gz" .; fi
# A backup that cannot be read is not a backup: list its contents before declaring success.
pg_restore --list "$dir/db.dump" > /dev/null
( cd "$dir" && sha256sum roles.sql db.dump storage.tar.gz 2>/dev/null > SHA256SUMS || true )
find "${BACKUP_DIR:-/backups}" -mindepth 1 -maxdepth 1 -type d -mtime +"${BACKUP_KEEP_DAYS:-30}" -exec rm -rf {} +
echo "backup ok: $dir"
