# Phase 12: Deployment & Infrastructure - Context

**Gathered:** 2026-01-17
**Status:** Ready for planning

<vision>
## How This Should Work

When I push to git, it should automatically deploy to production with zero manual steps. The deployment happens in the background — CI/CD builds everything, runs health checks, and switches traffic to the new version using blue-green deployment. Agents in the field don't even notice updates happening; the PWA seamlessly updates in the background, with an optional gentle notification that an update is available.

archibaldblackant.it should "just work" — HTTPS, fast loads, no downtime. Production should be boring and invisible. The app should be reliable enough that I rarely think about infrastructure.

If something goes wrong, the system auto-rolls back if health checks fail, but I also have a one-click manual rollback button in the admin dashboard. Pushing a critical bug fix should get it live in 5 minutes through the same pipeline — fast-track but still safe.

The admin monitoring dashboard lives at /admin/monitoring (admin-only route in the app). It shows app health, response times, error rates, bottlenecks, active users, and PWA usage time. No fancy external tools — keep it simple and integrated.

</vision>

<essential>
## What Must Be Nailed

- **Zero-downtime for agents in the field** - Deployments never disrupt active users. Agents can always access the app when they need it.
- **Fast deployment cycle** - Push a fix and it's live in < 5 minutes. Rapid iteration and bug fixes.
- **Easy rollback if something breaks** - Automatic rollback on health check failure + one-click manual rollback from dashboard. Safety net for production issues.
- **Reliable and boring** - HTTPS works, app loads fast, infrastructure is invisible. Production should "just work."

</essential>

<boundaries>
## What's Out of Scope

- **Multi-region deployment** - Single VPS in one region is sufficient. No geo-distribution or CDN setup.
- **Kubernetes or complex orchestration** - Docker Compose on single VPS is enough. No K8s, no clusters.
- **Advanced observability (traces, APM)** - Basic monitoring is enough. No Datadog, New Relic, or distributed tracing.

</boundaries>

<specifics>
## Specific Ideas

**Infrastructure:**
- VPS provider: DigitalOcean or Linode (€10-20/month budget)
- Stack: Docker Compose + Nginx (simple, standard, maintainable)
- SSL: Let's Encrypt with Certbot auto-renewal (set it and forget it)
- Chromium: Bundled in Docker container (self-contained, no system dependencies)

**CI/CD:**
- Platform: GitHub Actions (native to GitHub, good free tier)
- Pipeline: Push to main → auto-deploy with blue-green deployment
- Speed: 5 minutes from push to live (thorough CI checks, quality over speed)
- Rollback: Auto-rollback on health check failure + one-click manual rollback

**Monitoring:**
- Admin dashboard at /admin/monitoring (admin-only route)
- Metrics: app health (uptime, response times), error rates and logs, bottlenecks, active users, PWA usage time
- Alerts: (to be determined during planning)

**Backup & Recovery:**
- Automated daily backups with retention (cron job, keep last N days)
- Disaster recovery: Restore from backup within 1-2 hours acceptable
- Secrets: Environment variables in .env file on VPS (not in git)

**Logging:**
- Structured JSON logs with timestamps, user IDs, request IDs (easy to search and filter)

**PWA Updates:**
- Seamless service worker update in background by default
- Optional gentle notification: "Update available, refresh when convenient"

</specifics>

<notes>
## Additional Context

The deployment should feel like pushing to Vercel or Railway — automatic, fast, and reliable — but on our own VPS for control and cost. The focus is on simplicity and maintainability over fancy features.

Blue-green deployment ensures zero downtime: new version starts in parallel, traffic switches when ready, old version stays up during transition.

Database backups are critical and in scope. Automated daily backups prevent data loss.

5-minute deployment time is acceptable because it includes thorough CI checks — quality and safety over speed.

Monitoring is admin-only and integrated into the app (no external services). This keeps the stack simple and uses existing authentication.

</notes>

---

*Phase: 12-deployment-infrastructure*
*Context gathered: 2026-01-17*
