# Deployment Guide & Pre-Flight Checklist

## Overview

This document covers the deployment process for the Denbegaye Agent Workers platform across staging and production environments. All deployments are automated via GitHub Actions CI/CD pipeline with manual approval gates for production.

---

## Deployment Environments

| Environment    | Branch    | URL                           | Auto-Deploy | Approval    | Secrets Prefix |
| -------------- | --------- | ----------------------------- | ----------- | ----------- | -------------- |
| **Staging**    | `develop` | staging.denbegaye-workers.dev | ✅ Auto     | None        | `STAGING_`     |
| **Production** | `main`    | denbegaye-workers.dev         | ✅ Auto     | ✅ Required | None           |

---

## Pre-Deployment Checklist

### Before Merging to Staging (`develop`)

- [ ] Feature branch passes all CI checks (lint, test, build)
- [ ] Code review approved (minimum 1 reviewer)
- [ ] No merge conflicts
- [ ] Database migrations (if any) tested locally
- [ ] Environment variables documented in PR
- [ ] Breaking changes communicated to team
- [ ] Rollback plan documented (if complex change)

### Before Merging to Production (`main`)

- [ ] Staging deployment successful (no errors in past 24h)
- [ ] Smoke tests passed on staging
- [ ] Performance benchmarks reviewed (load testing if applicable)
- [ ] Security audit passed (no high-severity vulnerabilities)
- [ ] All stakeholders notified (product, ops, support)
- [ ] Maintenance window scheduled (if needed)
- [ ] Rollback plan reviewed and tested
- [ ] Monitoring alerts configured

---

## Deployment Process

### Automatic Deployment (CI/CD Pipeline)

#### 1. Commit & Push

```bash
# Feature development
git checkout -b feature/xyz
# ... code changes ...
git add .
git commit -m "feat: description"
git push origin feature/xyz
```

#### 2. Pull Request to Staging

```bash
# Create PR from feature/xyz → develop
# GitHub PR template auto-fills with checklist
# Reviewers check code, tests, breaking changes
# Once approved, merge to develop
```

**What happens automatically:**

- ✅ Lint & TypeScript check (Node 18.x, 20.x)
- ✅ Unit tests (with Redis)
- ✅ Build verification
- ✅ Security audit (npm audit, TruffleHog)
- ✅ Migrations validation
- ✅ **Auto-deploy to Staging** (no approval needed)

#### 3. Staging Validation (Manual)

After auto-deploy to staging:

```bash
# Option A: Test via API
curl -H "Authorization: Bearer <test-token>" \
  https://staging.denbegaye-workers.dev/api/health

# Option B: Check logs
# GitHub Actions → deploy-staging job → logs
# Or monitoring dashboard

# Option C: Smoke tests
npm run test:smoke -- --env staging
```

**Verify:**

- Application starts without errors
- Database connections stable
- Redis cache functional
- Rate limiters working
- Webhook handlers responsive
- Email service operational

#### 4. Pull Request to Production

```bash
# Create PR from develop → main
# Include staging validation results
# Deployment checklist must be complete
# Senior review required (2+ approvers)
```

**What happens automatically (blocked until approval):**

- ✅ Lint & TypeScript check
- ✅ Unit tests
- ✅ Build verification
- ✅ Security audit
- ✅ Migrations validation
- ⏸️ **Waiting for approval** (GitHub environment protection)

#### 5. Production Approval & Deployment

```bash
# In GitHub: Actions tab → deploy-production job
# Click "Review deployments"
# Select "Approve & deploy"
# Confirm deployment
```

**What happens automatically (after approval):**

- ✅ Builds production bundle (`NODE_ENV=production`)
- ✅ Runs database migrations (if any)
- ✅ Deploys to production infrastructure
- ✅ Health checks verify deployment
- ✅ Notifications sent to team Slack

---

## During Deployment

### Monitoring Checklist

```bash
# Watch deployment logs
GitHub Actions → deploy-production job → logs

# Monitor application health
curl https://denbegaye-workers.dev/api/health

# Check error rates
# - Application logs (cloud provider dashboard)
# - Error tracking (Sentry/DataDog)
# - Database query performance (Supabase dashboard)

# Verify features
curl -H "Authorization: Bearer <token>" \
  https://denbegaye-workers.dev/api/agents

# Check Redis cache
# - Connection: redis-cli PING
# - Memory: redis-cli INFO memory
# - Keys: redis-cli KEYS "*"

# Database health
# - Query performance (slow query logs)
# - Connection pool (Supabase metrics)
# - Replication lag (if multi-region)
```

### Common Issues & Quick Fixes

| Issue                            | Cause                     | Fix                                    |
| -------------------------------- | ------------------------- | -------------------------------------- |
| **503 Service Unavailable**      | App not responding        | Check logs, restart process            |
| **Database connection timeouts** | Connection pool exhausted | Increase `CONNECTION_POOL_SIZE`        |
| **Rate limit errors**            | Redis unavailable         | Verify Redis URL, check cluster status |
| **Webhook failures**             | Network latency           | Check firewall rules, retry webhooks   |
| **Memory usage spike**           | Memory leak in new code   | Revert PR, debug locally               |

---

## Post-Deployment Verification (SLA: 30 min)

### Automated Checks (run automatically)

- [ ] Health endpoint responds (200 OK)
- [ ] Database connection successful
- [ ] Redis cache operational
- [ ] OpenTelemetry metrics flowing
- [ ] No critical errors in logs (30 min window)

### Manual Smoke Tests

```bash
# 1. Agent execution
curl -X POST https://denbegaye-workers.dev/api/agent-run \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "test-agent",
    "input": "test query"
  }'

# 2. Webhook trigger
curl -X POST https://denbegaye-workers.dev/api/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# 3. Email service
# Check if scheduled email job executed

# 4. Rate limiting
# Make 65 requests in 1 minute from same IP → expect 429 on 61st

# 5. Database query
curl https://denbegaye-workers.dev/api/admin/health/db

# 6. Metrics
curl https://denbegaye-workers.dev/metrics
```

### Team Notifications

- [ ] Notify #deployments Slack channel
- [ ] Post deployment summary (timestamp, commits, changes)
- [ ] Tag release in GitHub (vX.Y.Z)
- [ ] Update deployment calendar/status page
- [ ] Monitor team mentions for issues

---

## Rollback Procedures

### Quick Rollback (< 5 minutes)

If critical issues detected within 30 minutes of production deployment:

```bash
# Option 1: Revert commit
git revert <commit-hash>
git push origin main
# CI/CD auto-deploys reverted code

# Option 2: Force previous deployment
# GitHub Actions → deploy-production
# Click "Re-run failed jobs" or manually trigger previous commit
```

**After rollback:**

- [ ] Notify team (Slack + email)
- [ ] Document issue (create bug report)
- [ ] Post-mortem meeting scheduled (24h after)
- [ ] Prevent similar issues (code review, tests, etc.)

### Full Rollback (with DB migration)

If database migration caused issues:

```bash
# 1. Revert application code
git revert <commit-hash>

# 2. Run rollback migration (if applicable)
# Supabase SQL editor:
BEGIN;
  -- Rollback migration (e.g., drop table, restore data)
ROLLBACK;  -- If anything fails, rollback entire transaction

# 3. Deploy application
git push origin main
# CI/CD redeploys with reverted DB

# 4. Verify
curl https://denbegaye-workers.dev/api/health
```

---

## Environment-Specific Configuration

### Staging Environment

```bash
# .env.staging (managed by GitHub secrets)
SUPABASE_URL=https://staging-xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<staging-key>
REDIS_URL=redis://staging-redis:6379
SERVICE_ROLE=all
NODE_ENV=production (for testing)
```

### Production Environment

```bash
# .env.production (managed by GitHub secrets)
SUPABASE_URL=https://prod-xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<prod-key>
REDIS_URL=redis://prod-redis:6379
SERVICE_ROLE=all
NODE_ENV=production
ENCRYPTION_KEY=<64-char-hex>
```

---

## Version Management

### Semantic Versioning

```
vMAJOR.MINOR.PATCH
v1.2.3 = Version 1, 2 minor features, 3 patches
```

### Release Tags

After successful production deployment:

```bash
# Create and push tag
git tag -a v1.2.3 -m "Release: Agent Workers v1.2.3"
git push origin v1.2.3

# GitHub automatically creates Release with changelog
# Edit release notes with deployment summary
```

---

## Disaster Recovery

If production experiences major outage:

### Immediate Actions (0-15 min)

1. [ ] Declare incident in #incidents Slack channel
2. [ ] Notify on-call engineer & team lead
3. [ ] Check GitHub Actions logs for deployment errors
4. [ ] Verify database connectivity (Supabase status)
5. [ ] Check Redis cluster status
6. [ ] Review error tracking (Sentry/DataDog)

### Investigation (15-45 min)

1. [ ] Identify root cause (code, DB, infrastructure)
2. [ ] Assess data impact (any data loss/corruption?)
3. [ ] Determine RTO (Recovery Time Objective)
4. [ ] Prepare rollback vs. forward-fix decision

### Recovery (45-120 min)

- **Option A:** Rollback to last known-good version
- **Option B:** Apply emergency hotfix (if safer than rollback)
- **Option C:** Database restore from backup (if data corruption)

### Post-Recovery (120+ min)

1. [ ] Verify all services restored
2. [ ] Run smoke tests
3. [ ] Notify customers of recovery
4. [ ] Schedule postmortem (24-48 hours)
5. [ ] Document incident & lessons learned
6. [ ] Implement preventative measures

---

## Monitoring & Alerting

### Real-Time Dashboards

- **Application Health:** https://monitoring.denbegaye-workers.dev/app-health
- **Database Performance:** Supabase dashboard → Analytics
- **Redis Cache:** Redis Commander (ops-only)
- **Error Tracking:** Sentry (errors.denbegaye-workers.dev)
- **Metrics:** Prometheus (metrics.denbegaye-workers.dev)

### Alert Thresholds

| Alert                | Threshold        | Action                 |
| -------------------- | ---------------- | ---------------------- |
| Error rate spike     | > 1% of requests | Page on-call           |
| P99 latency          | > 5 seconds      | Check slow queries     |
| Database connections | > 80% of pool    | Increase pool size     |
| Redis memory         | > 90% allocated  | Scale up or evict keys |
| Disk usage           | > 85%            | Archive old logs       |

---

## FAQ

**Q: How long does deployment take?**
A: ~5-10 minutes (build 2m + deploy 3-5m + health checks 2m)

**Q: Can I deploy at any time?**
A: Yes, but avoid 10pm-6am production windows. Always notify team.

**Q: What if tests fail during deployment?**
A: PR is blocked; fix failures locally, push to same branch, rerun CI.

**Q: Can I deploy directly to production without staging?**
A: No, all PRs must merge to develop first (except hotfixes).

**Q: How do I deploy a hotfix to production?**
A: Create PR: hotfix/xxx → main (skip develop). Requires emergency approval.

**Q: What's the SLA for production deployment?**
A: Deploy within 24 hours of PR approval. Hotfixes: < 1 hour.

---

## Support Contacts

- **DevOps Lead:** @devops-lead (Slack)
- **Database Admin:** @db-admin (Slack)
- **On-Call Engineer:** Check #incidents pinned message
- **Emergency:** Page via PagerDuty (ops-only)
