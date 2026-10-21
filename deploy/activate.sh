#!/usr/bin/env bash
set -euo pipefail
# Installed by provisioning as /usr/local/sbin/tigerretail-deploy (root owned).
release_id="${1:?release ID required}"
checksum="${2:?SHA256 required}"
[[ "$release_id" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]]
[[ "$checksum" =~ ^[0-9a-f]{64}$ ]]
exec 9>/run/lock/tigerretail-deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
root=/opt/tigerretail
release="$root/releases/$release_id"
[[ ! -e "$release" ]] || { echo 'Release already exists; retry using a new workflow attempt'; exit 1; }
archive="$(mktemp)"
trap 'rm -f "$archive"' EXIT
aws s3 cp "s3://tigerretail-deploy-104733724423-us-east-1/releases/$release_id.tar.gz" "$archive" --region us-east-1 --only-show-errors
printf '%s  %s\n' "$checksum" "$archive" | sha256sum -c -
install -d -o tigerretail -g tigerretail "$release"
tar -xzf "$archive" -C "$release" --no-same-owner
aws ssm get-parameter --name /tigerretail/production/environment --with-decryption --region us-east-1 --query Parameter.Value --output text > "$root/shared/environment.new"
chown root:tigerretail "$root/shared/environment.new"
chmod 640 "$root/shared/environment.new"
# Keep a copy of the previous environment for rollback with the previous release.
if [[ -f "$root/shared/environment" ]]; then
    cp -p "$root/shared/environment" "$root/shared/environment.previous"
fi
mv "$root/shared/environment.new" "$root/shared/environment"
ln -s "$root/shared/environment" "$release/.env.local"
chown -hR tigerretail:tigerretail "$release"
chmod -R g+rwX "$release"
# A failed migration stops the deployment before switching the live app.
if ! runuser -u tigerretail -- /usr/bin/node "$release/scripts/migrate.mjs"; then
    if [[ -f "$root/shared/environment.previous" ]]; then
        cp -p "$root/shared/environment.previous" "$root/shared/environment"
    fi
    exit 1
fi
previous="$(readlink -f "$root/current" 2>/dev/null || true)"
ln -s "$release" "$root/current.new"
mv -Tf "$root/current.new" "$root/current"
systemctl restart tigerretail
healthy=false
for attempt in $(seq 1 30); do
    if curl -fsS --max-time 5 http://127.0.0.1:3000/api/health >/dev/null; then
        healthy=true
        break
    fi
    sleep 2
done
if [[ "$healthy" != true ]]; then
    echo 'Health check failed; reverting application release (database migrations are not reverted).'
    if [[ -n "$previous" && -d "$previous" ]]; then
        ln -s "$previous" "$root/current.rollback"
        mv -Tf "$root/current.rollback" "$root/current"
        if [[ -f "$root/shared/environment.previous" ]]; then
            cp -p "$root/shared/environment.previous" "$root/shared/environment"
        fi
        systemctl restart tigerretail
    else
        systemctl stop tigerretail
    fi
    exit 1
fi
printf '%s\n' "$release_id" > "$root/shared/deployed-release"
echo "Deployed $release_id"
# Keep the five newest releases plus the active and immediately previous release.
python3 - "$root/releases" "$release" "$previous" <<'PY'
import pathlib, shutil, sys
releases = sorted(pathlib.Path(sys.argv[1]).iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
keep = {pathlib.Path(v) for v in sys.argv[2:] if v} | set(releases[:5])
for p in releases:
    if p.is_dir() and not p.is_symlink() and p not in keep:
        shutil.rmtree(p)
PY
