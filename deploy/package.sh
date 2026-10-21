#!/usr/bin/env bash
set -euo pipefail
# Run after a build on Linux ARM64, matching the Graviton EC2 instance.
release_dir="$(mktemp -d)"
trap 'rm -rf "$release_dir"' EXIT
cp -a .next/standalone/. "$release_dir/"
cp -a .next/static "$release_dir/.next/static"
if [[ -d public ]]; then cp -a public "$release_dir/public"; fi
mkdir -p "$release_dir/scripts"
cp scripts/migrate.mjs "$release_dir/scripts/"
# The CLI migration is outside Next's trace; include its dependency explicitly.
mkdir -p "$release_dir/node_modules"
cp -aL node_modules/postgres "$release_dir/node_modules/postgres"
cp -a db "$release_dir/db"
# Next traces runtime files, but a locally loaded env file must never ship.
find "$release_dir" -name '.env*' -type f -delete
COPYFILE_DISABLE=1 tar -czf release.tar.gz -C "$release_dir" .
sha256sum release.tar.gz > release.tar.gz.sha256
