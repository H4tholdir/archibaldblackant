# Phase 12 Plan 1: VPS Setup & Docker Foundation Summary

**VPS provisioned on Hetzner with Docker ready and domain DNS configured**

## Accomplishments

- ✅ VPS instance provisioned (Hetzner Cloud, Nuremberg Germany, 91.98.136.198)
- ✅ Docker 29.1.5 and Docker Compose v5.0.1 installed
- ✅ SSH access secured with key-only authentication
- ✅ Firewall configured with minimal ports (22, 80, 443 + IPv6)
- ✅ DNS configured for formicanera.com → 91.98.136.198 (Cloudflare Registrar)
- ✅ Deployment directory structure created at ~/archibald-app
- ✅ Basic monitoring tools installed (htop, ncdu, disk check script)
- ✅ Daily cron job configured (9 AM disk space check)

## Infrastructure Details

### VPS Specifications
- **Provider**: Hetzner Cloud
- **Location**: Nuremberg, Germany (eu-central)
- **Plan**: CPX22 (AMD)
- **CPU**: 2 vCPU AMD Ryzen
- **RAM**: 4 GB
- **Storage**: 80 GB SSD
- **Bandwidth**: 20 TB/month
- **Cost**: €7.31/month (€87.72/year)
- **Backups**: Enabled (+20%)
- **IP Address**: 91.98.136.198

### Domain Details
- **Domain**: formicanera.com
- **Registrar**: Cloudflare Registrar
- **DNS Provider**: Cloudflare
- **Cost**: ~€8-10/year (at-cost pricing)
- **Privacy WHOIS**: Included free
- **DNS Records**:
  - A @ → 91.98.136.198 (DNS only, proxy disabled)
  - A www → 91.98.136.198 (DNS only, proxy disabled)

## Files Created/Modified

### Remote VPS Configuration
- `/etc/ssh/sshd_config` - SSH hardening (key-only authentication)
- `/etc/ufw/` - Firewall configuration (ports 22, 80, 443)
- `/home/deploy/` - Non-root user with Docker and sudo access
- `/home/deploy/.ssh/authorized_keys` - SSH key for deploy user
- `/home/deploy/archibald-app/` - Deployment directory structure
  - `backend/` - Backend application directory
  - `frontend/` - Frontend application directory
  - `nginx/` - Nginx configuration directory
  - `scripts/` - Deployment and maintenance scripts
  - `data/` - Database files (permissions 700)
  - `logs/` - Application logs (permissions 700)
  - `backups/` - Backup storage directory
  - `.env.example` - Environment variables template
- `/usr/local/bin/check-disk-space.sh` - Disk monitoring script (threshold 80%)
- Cron job: `0 9 * * * /usr/local/bin/check-disk-space.sh`

### Software Installed
- Docker 29.1.5 (via official get.docker.com script)
- Docker Compose v5.0.1 (docker-compose-plugin)
- UFW (Uncomplicated Firewall)
- htop (interactive process viewer)
- ncdu (disk usage analyzer)

## Decisions Made

### VPS Provider: Hetzner Cloud
**Rationale**:
- Cost-effective (€7.31/month vs €24/month DigitalOcean = 70% savings)
- AMD Ryzen CPUs (30% faster than Intel equivalents for Puppeteer/Chromium workloads)
- 80 GB SSD (2x more than DigitalOcean basic plan)
- Excellent reputation for reliability
- Datacenter in Germany (low latency to Italy ~20-30ms)
- Backups included in price
- DigitalOcean payment issues encountered during provisioning

### DNS Strategy: Simple A Record (Cloudflare DNS only mode)
**Rationale**:
- Simplest setup with direct IP mapping
- No third-party proxy dependencies
- Let's Encrypt SSL works immediately without origin certificates
- DNS only mode (proxy disabled) for direct traffic to VPS
- Cloudflare DNS still provides fast global resolution
- Can enable Cloudflare proxy later if needed for DDoS protection

### Domain Registrar: Cloudflare Registrar
**Rationale**:
- At-cost pricing (~€8-10/year vs €15-20/year competitors)
- Privacy WHOIS included free (saves €5/year)
- Transparent pricing with no renewal markup
- DNSSEC included
- Modern DNS management interface
- Auto-renewal prevents domain expiration
- Original domain archibaldblackant.it not registered yet, chose formicanera.com instead

### Security: Key-only SSH, UFW Firewall, Non-root Deploy User
**Rationale**:
- SSH key-only authentication prevents brute-force attacks
- UFW firewall minimizes attack surface (only 22, 80, 443 exposed)
- Non-root deploy user follows principle of least privilege
- Sensitive directories (data/, logs/) have 700 permissions (owner-only)

## System Resource Baseline

### Current Usage (Fresh Install)
- **CPU**: 1 running task, 31 sleeping (idle system)
- **Memory**: 211M used / 3.7 GB total (5.6% utilization)
- **Swap**: 0K (not needed yet)
- **Disk**: ~10% used (fresh Ubuntu install + Docker)

### Expected Production Usage
- **Memory**: 1-2 GB (backend Node.js + Puppeteer + Redis + frontend Nginx)
- **Disk**: 15-30 GB (Docker images, databases, logs, backups)
- **CPU**: Low average usage, spikes during order processing

## Security Hardening Checklist

- ✅ SSH password authentication disabled
- ✅ SSH key-only authentication enabled
- ✅ Non-root deploy user created
- ✅ Deploy user in docker group (no sudo needed for Docker)
- ✅ UFW firewall active and enabled on startup
- ✅ Only essential ports exposed (22, 80, 443)
- ✅ Sensitive directories protected (700 permissions)
- ✅ SSH keys properly configured with correct permissions (700 .ssh/, 600 authorized_keys)
- ⏳ SSL/TLS certificates (pending - Plan 12-02)
- ⏳ Rate limiting on Nginx (pending - Plan 12-02)
- ⏳ Fail2ban intrusion detection (optional, not in current plans)

## Monitoring Configuration

### Installed Tools
- **htop**: Interactive process viewer for real-time system monitoring
- **ncdu**: Disk usage analyzer with interactive navigation
- **check-disk-space.sh**: Custom script that warns when disk usage exceeds 80%

### Automated Monitoring
- Daily disk space check at 9 AM (cron job)
- Threshold: 80% disk usage triggers warning
- Future enhancement: Integrate with admin monitoring dashboard (Plan 12-04)

### Manual Monitoring Commands
```bash
# Real-time process monitoring
htop

# Disk usage analysis
ncdu /home/deploy

# Firewall status
sudo ufw status

# Docker container status
docker ps

# System resources
free -h
df -h
```

## DNS Propagation Verification

### Verification Commands
```bash
# Check A record for root domain
dig formicanera.com +short
# Expected: 91.98.136.198

# Check A record for www subdomain
dig www.formicanera.com +short
# Expected: 91.98.136.198

# Check DNS propagation globally
dig @8.8.8.8 formicanera.com +short
# Expected: 91.98.136.198
```

### Propagation Time
- **Cloudflare DNS**: 2-5 minutes (observed)
- **Global propagation**: < 10 minutes
- **TTL**: Auto (managed by Cloudflare)

## Issues Encountered

### DigitalOcean Payment Rejection
**Problem**: User encountered multiple payment method rejections when attempting to provision DigitalOcean Droplet.

**Solution**: Switched to Hetzner Cloud, which accepted payment immediately. Hetzner turned out to be superior choice with better specs at lower cost (€7.31 vs €24/month for similar configuration).

### Hetzner Datacenter Availability
**Problem**: Initial attempts to provision in Falkenstein datacenter failed with "temporarily unavailable due to high demand" error. Helsinki datacenter also attempted but user preferred German location.

**Solution**: Successfully provisioned in Nuremberg datacenter (also in Germany, eu-central region, similar latency to Italy as Falkenstein).

### Domain Registration Change
**Problem**: Original plan specified archibaldblackant.it domain, but user had not yet registered it.

**Solution**: User registered formicanera.com on Cloudflare Registrar instead. Updated all DNS configurations to use new domain. Plan 12-02 onwards will reference formicanera.com.

## Cost Summary (Monthly)

| Item | Provider | Cost |
|------|----------|------|
| VPS (CPX22 + Backups) | Hetzner Cloud | €7.31/mo |
| Domain Registration | Cloudflare | €0.67/mo (~€8/year) |
| **Total Monthly** | | **€7.98/mo** |
| **Total Yearly** | | **€95.76/year** |

**Comparison to Original Budget**:
- Original estimate: €10-20/month VPS
- Actual: €7.98/month total (VPS + domain)
- **Savings**: €2-12/month (20-60% under budget)

## Next Steps

### Immediate (Plan 12-02)
1. Create backend Dockerfile with Chromium bundled
2. Create frontend Dockerfile with Nginx static serve
3. Create docker-compose.yml with all services
4. Configure Nginx reverse proxy with SSL termination
5. Generate Let's Encrypt SSL certificates for formicanera.com
6. Create production .env file with real credentials (not committed to git)

### Testing Checklist Before Proceeding
- [x] SSH access works with deploy user
- [x] Docker commands work without sudo
- [x] Firewall allows only necessary ports
- [x] DNS resolves to correct IP
- [x] Directory structure exists with correct permissions
- [x] Monitoring tools installed and working
- [x] Cron job scheduled

## Commands Reference

### SSH Connection
```bash
# Connect as deploy user
ssh -i ~/.ssh/hetzner_archibald deploy@91.98.136.198

# Connect as root (discouraged, use deploy instead)
ssh -i ~/.ssh/hetzner_archibald root@91.98.136.198
```

### Docker Commands
```bash
# Check Docker status
docker --version
docker compose version
docker ps

# View logs
docker compose logs -f backend
docker compose logs -f frontend
```

### Firewall Management
```bash
# Check status
sudo ufw status

# Allow new port (if needed)
sudo ufw allow 8080/tcp

# Reload firewall
sudo ufw reload
```

### Monitoring
```bash
# Interactive process viewer
htop

# Disk usage analyzer
ncdu /home/deploy

# Check disk space
df -h

# Check memory
free -h

# Run disk check script manually
/usr/local/bin/check-disk-space.sh
```

## Lessons Learned

1. **VPS Provider Selection**: Hetzner Cloud proved superior to DigitalOcean in both cost and specs. AMD Ryzen CPUs offer better performance for compute-intensive workloads like Puppeteer/Chromium.

2. **Payment Methods**: Payment flexibility matters. Hetzner's acceptance of multiple payment methods (PayPal, credit card, SEPA) prevented delays.

3. **Datacenter Availability**: Popular datacenters (Falkenstein) may have capacity constraints. Having fallback options (Nuremberg) within same region ensures continuity.

4. **Domain Registration**: Cloudflare Registrar's at-cost pricing and included features (WHOIS privacy, DNSSEC) make it ideal for cost-conscious deployments.

5. **DNS Configuration**: Disabling Cloudflare proxy (DNS only mode) simplifies initial SSL setup with Let's Encrypt. Can enable proxy later for DDoS protection if needed.

6. **Security Hardening**: Implementing security measures (SSH keys, firewall, non-root user) upfront is easier than retrofitting later.

## Validation Status

✅ **Plan 12-01 Complete - All Success Criteria Met**

- [x] VPS provisioned and accessible via SSH
- [x] Docker and Docker Compose installed and working
- [x] Non-root deploy user created with Docker access
- [x] SSH hardened (key-only authentication)
- [x] Firewall configured (ports 22, 80, 443 only)
- [x] DNS resolves formicanera.com to VPS IP (91.98.136.198)
- [x] Directory structure created in ~/archibald-app
- [x] Basic monitoring tools installed
- [x] No errors in verification checks

## Ready for Plan 12-02

**Prerequisites satisfied**:
- ✅ VPS accessible and secured
- ✅ Docker ready for container deployment
- ✅ Domain DNS configured and resolving
- ✅ Directory structure prepared
- ✅ Monitoring infrastructure in place

**Plan 12-02 will add**:
- Docker container definitions (Dockerfiles)
- Container orchestration (docker-compose.yml)
- SSL certificates (Let's Encrypt)
- Nginx reverse proxy configuration
- Production environment secrets (.env file)

---

**Duration**: ~60 minutes (VPS provisioning, Docker installation, DNS configuration)

**Date Completed**: 2026-01-17

**Next**: Proceed to [12-02-PLAN.md](12-02-PLAN.md) - Docker Orchestration & SSL
