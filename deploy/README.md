# AWS hosting

TigerRetail runs on a dedicated ARM64 `t4g.small` in `us-east-1`. Node 22 serves
Next.js on `127.0.0.1:3000`; nginx accepts requests for `retail.tigerapps.org`.
Cloudflare proxies the hostname and terminates public HTTPS. Origin port 80 is
restricted to Cloudflare's published address ranges by the EC2 security group.

## CI/CD

Push to `main` to run lint, all unit tests, and a standalone Next.js build on an
ARM64 GitHub runner. A successful build uploads a checksum-verified release to a
private S3 bucket and invokes the `TigerRetailDeploy` SSM document. Deployments
are serialized. Pull requests run the checks/build without deploying.

GitHub uses OIDC (no stored AWS access key or SSH private key). Its deploy role
trusts only `TigerAppsOrg/TigerRetail` on `refs/heads/main`. Repository variables:

- `AWS_DEPLOY_ROLE_ARN`: the dedicated `TigerRetailGitHubDeployRole` ARN.
- `EC2_INSTANCE_ID`: the `tigerretail-web` instance ID.

The EC2 role can read only this app's release prefix and production environment,
plus the standard Systems Manager permissions.

Dependencies for CI use `bun.lock`; install with `bun install --frozen-lockfile`.
Node 22 runs both the build and the deployed server. If dependencies change,
update and commit the Bun lockfile along with `package.json`.

## Runtime secrets

AWS SSM SecureString `/tigerretail/production/environment` is the source of truth.
Deployments write it to `/opt/tigerretail/shared/environment` (root:tigerretail,
mode 640). It is linked as `.env.local` in each release for the migration script.
No runtime credentials are included in the GitHub build or release artifact.

Required values: `APP_URL=https://retail.tigerapps.org`, `SESSION_SECRET`,
`DATABASE_URL`, and the five R2 settings from `.env.example`. The MVP uses the
existing `tigerretail_dev` database and shared R2 bucket, so local changes affect
the hosted MVP too. Optional import and mail keys are listed in `.env.example`.
`INVITES_TO_SELLERS` remains unset until explicitly enabled by the team.

Changing the SSM parameter takes effect on the next deployment. Do not edit the
checked-in example to add real credentials. No automatic import cron is enabled
on EC2; Raj can run imports through the admin page after configuring its keys.

## SSH and operations

Connect as `raj` using the private key corresponding to the public key supplied
to TigerApps. Use the EC2 public IP rather than the Cloudflare-proxied web hostname.

```sh
ssh -i ~/.ssh/id_ed25519 raj@<EC2_PUBLIC_IP>
cd /opt/tigerretail/current
journalctl -u tigerretail -f
sudo systemctl restart tigerretail
curl -fsS http://127.0.0.1:3000/api/health
```

Raj belongs to the app group and can read its secrets, work with its releases,
and restart its service. He does not have unrestricted root access. Deploy code
through GitHub: edits to the active release are replaced on the next deployment.

Files:

- `/opt/tigerretail/current`: symlink to the active standalone release.
- `/opt/tigerretail/releases`: versioned releases (five most recent retained,
  plus the active and immediately previous release).
- `/opt/tigerretail/shared`: runtime environment and deployed release ID.
- `/usr/local/sbin/tigerretail-deploy`: root-owned activation script.
- `/etc/systemd/system/tigerretail.service`: app service.
- `/etc/nginx/sites-enabled/tigerretail`: web proxy configuration.

## Migrations and rollback

Each deploy runs only pending `db/migrations/*.sql` files using the app database
role before switching the active release. It never seeds or resets the database.
Each migration runs in its own transaction. The new server must pass
`/api/health`, including a database query; otherwise the previous application
release and environment are restored automatically.

Database migrations are **not** reverted by an application rollback. Write
backward-compatible migrations and coordinate destructive schema changes with
the team because this is the shared development database.

Provisioning installs `deploy/activate.sh`, `deploy/tigerretail.service`, and
`deploy/nginx.conf` onto the host. Changes to those operating-system files require
an administrator to update the host; normal app deployments only replace releases.
