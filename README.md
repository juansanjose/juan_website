# Juan Website

Minimal Hugo personal site deployed to the same VPS infrastructure as the church website. Church content, themes, images, and WordPress migration files are intentionally excluded.

## Local development

Requires Hugo Extended 0.159.2.

```bash
make install-hooks
make serve
```

Open <http://localhost:8080>. The tracked hooks build the site before commits and pushes.

## Deployment model

Pushes to `main` trigger GitHub Actions:

1. A GitHub-hosted runner builds Hugo and uploads the static artifact.
2. The existing self-hosted runner labeled `church-vps` downloads it.
3. Files are copied to a separate deploy directory while retaining one rollback copy.
4. A separate Caddy site fragment is validated and Caddy is reloaded.
5. HTTPS is checked before the workflow succeeds.

### One-time configuration

1. Point the chosen domain's DNS A/AAAA records at the VPS.
2. In GitHub repository **Settings → Secrets and variables → Actions → Variables**, set:
   - `PERSONAL_DOMAIN`, for example `juan.example.com`
   - `PERSONAL_DEPLOY_PATH`, recommended `/var/www/juan-website`
3. Make the self-hosted VPS runner available to this repository with the labels `self-hosted`, `linux`, and `church-vps`. If the church runner is repository-scoped, register another runner for `juan_website` or move it to an organization runner group that permits both repositories.
4. On the VPS, clone this repository or copy `scripts/vps-setup.sh`, then run:

```bash
sudo PERSONAL_DEPLOY_PATH=/var/www/juan-website scripts/vps-setup.sh
```

The setup script preserves the current Caddy configuration, creates a backup, and adds support for independently deployed site fragments.

5. Replace `https://example.com/` in `site/hugo.toml` with the production URL.
6. Push `main`, or start the `Build and Deploy` workflow manually.

## Manual operations

```bash
make build
make deploy DEPLOY_PATH=/var/www/juan-website
make rollback DEPLOY_PATH=/var/www/juan-website
```

Direct deployment requires SSH access to `root@moneymachine`. Normal deployment should go through GitHub Actions.
