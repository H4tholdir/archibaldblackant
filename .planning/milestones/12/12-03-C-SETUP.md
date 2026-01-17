# Phase 12-03-C: CI/CD Pipeline Setup Guide

## Overview

This guide explains how to set up GitHub Actions for automatic testing and deployment to your VPS.

## Architecture

```
Local Dev → Git Push → GitHub Actions → GitHub Container Registry → VPS
                ↓
              CI Tests
              (TypeCheck, Lint, Build)
                ↓
              CD Deploy
              (Build Images, Push to Registry, Deploy to VPS)
```

## Step 1: Generate SSH Key for GitHub Actions

On your **local machine**, generate a new SSH key for GitHub Actions:

```bash
# Generate SSH key (without passphrase for automation)
ssh-keygen -t ed25519 -C "github-actions@archibald" -f ~/.ssh/github_actions_archibald

# Copy the private key (this goes into GitHub Secrets)
cat ~/.ssh/github_actions_archibald

# Copy the public key (this goes on the VPS)
cat ~/.ssh/github_actions_archibald.pub
```

## Step 2: Add SSH Public Key to VPS

SSH into your VPS and add the public key to authorized_keys:

```bash
# On your local machine
ssh deploy@91.98.136.198

# On the VPS
nano ~/.ssh/authorized_keys
# Paste the public key at the end of the file
# Save and exit (Ctrl+X, Y, Enter)

# Test the connection from local machine
ssh -i ~/.ssh/github_actions_archibald deploy@91.98.136.198 "echo Connection successful"
```

## Step 3: Configure GitHub Secrets

Go to your GitHub repository:
1. Navigate to: `Settings` → `Secrets and variables` → `Actions`
2. Click `New repository secret`
3. Add the following secrets:

### Required Secrets

| Secret Name | Value | Description |
|------------|-------|-------------|
| `VPS_HOST` | `91.98.136.198` | Your VPS IP address |
| `VPS_USER` | `deploy` | SSH user on VPS |
| `VPS_SSH_KEY` | *[Private key content]* | Contents of `~/.ssh/github_actions_archibald` |

**Note**: `GITHUB_TOKEN` is automatically provided by GitHub Actions, no need to add it.

### How to add VPS_SSH_KEY:

1. Copy the entire private key including header and footer:
   ```
   -----BEGIN OPENSSH PRIVATE KEY-----
   [key content]
   -----END OPENSSH PRIVATE KEY-----
   ```
2. Paste it into the secret value field
3. Make sure there are no extra spaces or line breaks at the beginning or end

## Step 4: Configure GitHub Container Registry

Enable GitHub Container Registry (GHCR) for your repository:

1. Go to repository `Settings` → `Actions` → `General`
2. Under "Workflow permissions", select:
   - ✅ **Read and write permissions**
   - ✅ **Allow GitHub Actions to create and approve pull requests**
3. Click `Save`

## Step 5: Make Container Images Public (Optional)

To avoid authentication issues on VPS:

1. Go to your GitHub profile → `Packages`
2. Find `archibald-backend` and `archibald-frontend`
3. Click on each package → `Package settings`
4. Under "Danger Zone", click `Change visibility` → `Public`

Alternatively, log in to GHCR on the VPS:
```bash
# On VPS
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

## Step 6: Update VPS Docker Compose

On the VPS, update the docker-compose.yml to use GHCR images:

```bash
# On VPS
ssh deploy@91.98.136.198
cd /home/deploy/archibald-app

# Pull latest code
git pull origin master

# Test pulling images from GHCR
docker pull ghcr.io/h4tholdir/archibald-backend:latest
docker pull ghcr.io/h4tholdir/archibald-frontend:latest
```

## Step 7: Test the CI/CD Pipeline

### Test CI (Continuous Integration)

1. Make a small change to the codebase
2. Commit and push to master:
   ```bash
   git add .
   git commit -m "test: verify CI pipeline"
   git push
   ```
3. Go to GitHub → `Actions` tab
4. Watch the "CI - Test & Build" workflow run
5. Verify all jobs pass ✅

### Test CD (Continuous Deployment)

1. If CI passes, the "CD - Deploy to Production" workflow will start automatically
2. Watch the deployment progress in the Actions tab
3. After completion, verify the deployment:
   ```bash
   curl https://formicanera.com/api/health
   ```

## Step 8: Workflow Triggers

### Automatic Triggers

- **Every push to master**: Triggers both CI and CD
- **Every pull request**: Triggers only CI (no deployment)

### Manual Trigger

You can manually trigger a deployment:
1. Go to GitHub → `Actions`
2. Select "CD - Deploy to Production"
3. Click `Run workflow` → `Run workflow`

## Troubleshooting

### Issue: SSH Connection Failed

**Error**: `Permission denied (publickey)`

**Solution**:
1. Verify the private key is correctly copied to GitHub Secrets
2. Verify the public key is in `/home/deploy/.ssh/authorized_keys` on VPS
3. Test SSH connection manually:
   ```bash
   ssh -i ~/.ssh/github_actions_archibald deploy@91.98.136.198
   ```

### Issue: Docker Image Not Found

**Error**: `image not found: ghcr.io/.../archibald-backend:latest`

**Solution**:
1. Check if images are pushed to GHCR: Go to your GitHub profile → `Packages`
2. Make images public or log in to GHCR on VPS
3. Verify repository name matches in docker-compose.prod.yml

### Issue: Deployment Health Check Failed

**Error**: `curl -f https://formicanera.com/api/health` returns error

**Solution**:
1. Check backend logs on VPS:
   ```bash
   docker compose logs backend --tail=50
   ```
2. Verify services are running:
   ```bash
   docker compose ps
   ```
3. Check if graceful shutdown completed successfully

### Issue: Build Cache Issues

**Error**: Old code is being deployed

**Solution**:
```bash
# On VPS
docker compose down
docker system prune -a -f
docker pull ghcr.io/h4tholdir/archibald-backend:latest
docker pull ghcr.io/h4tholdir/archibald-frontend:latest
docker compose up -d
```

## Monitoring Deployments

### GitHub Actions Dashboard

- Go to: `https://github.com/H4tholdir/archibaldblackant/actions`
- View all workflow runs
- Click on a run to see detailed logs

### VPS Monitoring

```bash
# Watch deployment logs in real-time
ssh deploy@91.98.136.198 "cd /home/deploy/archibald-app && docker compose logs -f backend"

# Check service status
ssh deploy@91.98.136.198 "cd /home/deploy/archibald-app && docker compose ps"
```

## Best Practices

1. **Always test locally first** before pushing
2. **Write descriptive commit messages** following Conventional Commits
3. **Monitor the Actions tab** after pushing to catch issues early
4. **Keep secrets secure** - never commit them to git
5. **Use feature branches** for major changes, merge to master when ready

## Next Steps

After CI/CD is working:
- Set up deployment notifications (Slack, Discord, Email)
- Add automated tests to CI pipeline
- Implement blue-green deployment for zero-downtime updates
- Add staging environment for testing before production

## Useful Commands

```bash
# Test CI locally (before pushing)
cd archibald-web-app/backend
npm run build
npx tsc --noEmit

# View GitHub Actions logs
gh run list  # List recent workflow runs
gh run view  # View specific run details

# Manual deployment (if needed)
ssh deploy@91.98.136.198 "cd /home/deploy/archibald-app && git pull && docker compose pull && docker compose up -d"
```
