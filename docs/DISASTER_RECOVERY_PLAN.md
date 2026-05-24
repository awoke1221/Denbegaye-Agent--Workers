# Disaster Recovery Plan

## Executive Summary

This document outlines the disaster recovery strategy for the Denbegaye Agent Workers platform, covering data backup, recovery procedures, RTO/RPO targets, and business continuity measures.

---

## 1. Disaster Recovery Strategy

### Recovery Objectives

| Metric                             | Target     | Rationale                             |
| ---------------------------------- | ---------- | ------------------------------------- |
| **RTO** (Recovery Time Objective)  | 2 hours    | Critical business process restoration |
| **RPO** (Recovery Point Objective) | 1 hour     | Maximum acceptable data loss          |
| **MTTR** (Mean Time To Repair)     | 90 minutes | Target for incident resolution        |
| **Backup Frequency**               | Hourly     | Ensures RPO compliance                |
| **Test Frequency**                 | Quarterly  | Validate recovery procedures          |

### Disaster Classification

| Level             | Impact                   | Examples                                         | Response                       |
| ----------------- | ------------------------ | ------------------------------------------------ | ------------------------------ |
| **P1 - Critical** | Service unavailable      | Database down, data corruption, security breach  | Invoke DR immediately          |
| **P2 - High**     | Degraded performance     | High error rates, slow responses, partial outage | Incident response + monitoring |
| **P3 - Medium**   | Minor functionality lost | Single feature broken, isolated user impact      | Standard incident procedures   |
| **P4 - Low**      | Cosmetic issues          | UI glitches, documentation gaps                  | Scheduled fix                  |

---

## 2. Data Backup Strategy

### Backup Locations & Frequency

#### Primary Backup (Supabase Automated)

```
Supabase PostgreSQL → Automated backup every 24 hours
├── Retention: 7 days point-in-time recovery
├── Storage: Supabase-managed (US region)
├── Recovery: Via Supabase dashboard (restore to point-in-time)
└── SLA: RTO 30 minutes, RPO 24 hours
```

**Tables backed up:**

- `users` - User accounts & authentication
- `agents` - Agent configurations
- `jobs` - Job queue & execution history
- `user_subscriptions` - Billing & rate limit tiers
- `api_keys_vault` - Encrypted API keys
- `vector_memory` - Semantic memory embeddings
- `dead_letter_queue` - Failed job history
- `audit_logs` - Compliance & security audit trail

#### Secondary Backup (Cloud Storage)

```bash
# Daily export to AWS S3 (or GCS)
├── Schedule: 2:00 AM UTC daily
├── Format: PostgreSQL pg_dump + compressed gzip
├── Retention: 30 days (rolling)
├── Location: s3://denbegaye-backups/pg-exports/
└── Encryption: AES-256 (encrypted at rest)
```

**Backup script** (to be deployed):

```bash
#!/bin/bash
# scripts/backup-db.sh
set -e

DB_NAME="denbegaye_db"
DB_BACKUP_PATH="pg-backups/$(date +%Y-%m-%d_%H-%M-%S)_backup.sql.gz"
AWS_BACKUP_BUCKET="denbegaye-backups"

echo "Starting database backup..."
pg_dump \
  --host=$SUPABASE_HOST \
  --username=$SUPABASE_USER \
  --password=$SUPABASE_PASSWORD \
  --format=custom \
  $DB_NAME | gzip > /tmp/db_backup.sql.gz

# Upload to S3
aws s3 cp /tmp/db_backup.sql.gz "s3://$AWS_BACKUP_BUCKET/$DB_BACKUP_PATH" \
  --sse AES256 \
  --storage-class STANDARD_IA

# Retention: Delete backups older than 30 days
aws s3 rm "s3://$AWS_BACKUP_BUCKET/pg-backups/" \
  --recursive \
  --exclude "*" \
  --include "*.gz" \
  --older-than 30

echo "Backup completed: $DB_BACKUP_PATH"
```

#### Redis Cache Backup

```
Redis → Supabase (optional, lower priority)
├── Data: Job queue, rate limit counters, cache
├── Frequency: Continuous replication (if Redis cluster)
├── RTO: 15 minutes (rebuild from queue)
└── Note: Non-critical (data rebuilt from DB)
```

**Recovery procedure (Redis):**

```bash
# If Redis lost, restart clean
redis-cli FLUSHALL  # Clear all data
# Job queue rebuilt from Supabase jobs table
# Rate limits reset (users can retry)
# Cache rebuilt on-demand
```

---

## 3. Disaster Scenarios & Recovery Procedures

### Scenario 1: Database Corruption

**Indicators:**

- Query errors (`Integrity constraint violation`)
- Data anomalies (negative counts, orphaned records)
- Replication errors
- Application crashes on specific queries

**Recovery Steps (RTO: 1 hour):**

1. **Detect & Alert** (5 min)

   ```bash
   # Automated check via monitoring
   SELECT COUNT(*) FROM pg_stat_user_tables
   WHERE last_vacuum IS NULL AND n_tup_ins > 1000000;
   ```

   - Alert: Slack #incidents channel
   - Page: On-call DBA

2. **Isolate** (10 min)
   - Set application to read-only mode
   - Pause job processing (`SERVICE_ROLE=api`)
   - Cut off new connections to affected table

3. **Identify Scope** (10 min)

   ```sql
   -- Supabase SQL Editor
   PRAGMA integrity_check;  -- PostgreSQL check
   SELECT * FROM pg_stat_user_tables WHERE n_dead_tup > 1000000;
   ```

4. **Restore from Backup** (20 min)
   - Supabase dashboard → Backups
   - Select point-in-time: ~1 hour before corruption detected
   - Click "Restore"
   - Verify data integrity post-restore

5. **Verify & Resume** (5 min)
   ```bash
   curl -H "Auth: Bearer $SERVICE_TOKEN" \
     https://denbegaye-workers.dev/api/admin/health/db
   # Expected: { "status": "healthy", "tables": 12, "rows": 1M+ }
   ```

   - Resume application (remove read-only)
   - Resume job processing
   - Monitor error rate (should drop to 0)

### Scenario 2: Complete Database Loss

**Indicators:**

- Connection timeouts (all queries)
- 503 Service Unavailable
- Supabase dashboard unreachable
- Network connectivity issues to DB

**Recovery Steps (RTO: 2 hours):**

1. **Verify Failure** (5 min)

   ```bash
   # From bastion host (ops only)
   psql -h postgres.denbegaye.io -U postgres -d postgres \
     -c "SELECT version();"
   # Expected: Connection refused or timeout
   ```

2. **Activate DR Procedure** (5 min)
   - Page: VP Ops + Database team
   - Declare incident in #incidents
   - Activate Slack war room

3. **Restore from S3 Backup** (60 min)

   ```bash
   # Option A: Restore to Supabase (preferred)
   # Contact Supabase support for S3 restore

   # Option B: Restore to new Supabase project
   aws s3 cp "s3://denbegaye-backups/pg-backups/latest_backup.sql.gz" \
     /tmp/restore.sql.gz
   gunzip /tmp/restore.sql.gz
   psql -h new-postgres.denbegaye.io -U postgres \
     -f /tmp/restore.sql
   ```

4. **Update Application Configuration** (15 min)

   ```bash
   # Update environment variables to new DB host
   export SUPABASE_URL=https://new-project.supabase.co
   export SUPABASE_SERVICE_ROLE_KEY=new_key

   # Deploy configuration change (hot-reload if possible)
   # Or restart application instances
   ```

5. **Verify & Resume** (10 min)
   - Run smoke tests
   - Verify data integrity
   - Resume all traffic
   - Monitor metrics

### Scenario 3: Redis Cluster Failure

**Indicators:**

- Rate limit errors (`REDIS_CONNECTION_FAILED`)
- Job queue backed up
- High latency on API endpoints
- `Retry-After` headers in responses

**Recovery Steps (RTO: 15 minutes):**

1. **Assess Impact** (2 min)

   ```bash
   redis-cli CLUSTER INFO
   # Expected: cluster_state:fail if full failure
   # Or: connection_errors_io / connection_errors_timeout spike
   ```

2. **Failover** (5 min)
   - If Redis Cluster: Auto-failover to replica (handled by cluster)
   - If standalone Redis: Manual switch to standby instance

   ```bash
   # Update REDIS_URL in environment
   export REDIS_URL=redis://redis-standby:6379
   # Restart application (or hot-reload config)
   ```

3. **Rebuild Cache** (5 min)
   - Rate limit counters: Soft reset (users get fresh allowance)
   - Job queue: Rebuilds from Supabase on startup
   - Session cache: Rebuilt on login

   ```bash
   redis-cli FLUSHALL  # Clear corrupted data
   # Application auto-rebuilds on-demand
   ```

4. **Restore Production Redis** (ongoing)
   - Investigate root cause
   - Repair or replace failed nodes
   - Re-sync cluster
   - Migrate back to production (off-hours)

### Scenario 4: Application Code Bug / Regression

**Indicators:**

- Error rate spike (> 5%)
- 500 errors in logs
- User complaints about specific feature
- Deployment logs show recent code change

**Recovery Steps (RTO: 10 minutes):**

1. **Detect** (automated or manual report)

   ```bash
   # Monitoring alert: Error rate > 5%
   # Action: Page on-call engineer
   ```

2. **Assess Scope** (2 min)
   - Which endpoints affected?
   - Which users impacted?
   - Is data at risk?

3. **Rollback** (5 min)

   ```bash
   # Option A: Revert commit (preferred)
   git revert <buggy-commit>
   git push origin main  # Auto-deploys via CI/CD

   # Option B: Deploy previous image tag
   # Kubernetes: kubectl set image deployment/api api=image:v1.2.2
   ```

4. **Verify** (2 min)

   ```bash
   curl https://denbegaye-workers.dev/api/health
   # Error rate should drop within 1 minute
   ```

5. **Investigate** (post-recovery)
   - Review code changes in deployment
   - Check test coverage gaps
   - Implement missing tests
   - Deploy fix forward (next release)

### Scenario 5: Security Breach

**Indicators:**

- Unauthorized access logs
- API keys leaked to public repo
- DDoS attack detected
- Suspicious database queries

**Recovery Steps (RTO: 30 minutes for containment, 4 hours for full recovery):**

1. **Contain Immediately** (5 min)

   ```bash
   # 1. Revoke all API keys
   # 2. Rotate ENCRYPTION_KEY
   # 3. Lock suspicious user accounts
   # 4. Enable 2FA if not already
   # 5. Block attacker IP ranges
   ```

2. **Assess Impact** (10 min)
   - Was PII exposed? (names, emails, passwords)
   - Were API keys compromised?
   - Were secrets leaked?
   - How many users affected?

3. **Immediate Actions** (15 min)

   ```bash
   # Rotate encryption key
   ./scripts/rotate_api_keys.ts \
     --old-key=$OLD_KEY \
     --new-key=$NEW_KEY \
     --apply

   # Revoke exposed API keys
   UPDATE api_keys_vault
   SET status = 'revoked'
   WHERE compromised = true;

   # Force password reset
   UPDATE users
   SET password_reset_required = true
   WHERE id IN (select user_id from affected_users);
   ```

4. **Notify Stakeholders** (20 min)
   - Legal team
   - Compliance officer
   - Affected users (email + in-app notification)
   - Financial/payment processor (if payment data exposed)

5. **Incident Investigation** (24-48 hours)
   - Forensics: Review logs, identify breach vector
   - Root cause analysis: How did they gain access?
   - Implement fixes: Patch vulnerability
   - Security audit: Identify other exposures

6. **Public Communication** (per legal/PR)
   - Transparent notification to customers
   - Explanation of impact & mitigation
   - Incident postmortem (public or NDA)

---

## 4. Business Continuity

### Failover Architecture

```
Primary Region (US-East-1)
├── Supabase Database (RTO: 30 min, RPO: 24h via automated backup)
├── Redis Cluster (RTO: 5 min via failover)
├── Application Servers (RTO: 10 min via auto-scaling)
└── Load Balancer (99.99% SLA)

Secondary Region (US-West-2) [Standby]
├── Database Read Replica (sync, 5 sec replication lag)
├── Redis Standby (manual switchover)
└── Standby application servers (auto-spin on demand)
```

### Testing Schedule

| Test                      | Frequency     | Duration | Owner          |
| ------------------------- | ------------- | -------- | -------------- |
| **Backup restore test**   | Monthly       | 2 hours  | Database team  |
| **Failover drill**        | Quarterly     | 1 hour   | DevOps + Ops   |
| **Full DR simulation**    | Semi-annually | 4 hours  | All teams      |
| **Security incident sim** | Annually      | 2 hours  | Security + Ops |

### Communication Plan

**During Disaster:**

```
1. Internal (0 min):
   - Slack: #incidents channel
   - Page: On-call team

2. Affected Users (15 min):
   - Email notification
   - In-app banner
   - Twitter / status page

3. Leadership (30 min):
   - Executive summary
   - ETA for resolution
   - Financial impact

4. Public (60 min):
   - Status page update
   - Blog post (if major incident)
   - Community forum post
```

**Post-Recovery:**

```
1. Internal Review (24 hours):
   - What went wrong?
   - How do we prevent it?
   - Timeline & impact analysis

2. Customer Communication (48 hours):
   - Incident summary
   - Root cause explanation
   - Prevention measures

3. Public Postmortem (1 week):
   - Blog post or transparency report
   - Technical details (if security-appropriate)
   - Commitment to improvements
```

---

## 5. Key Contacts & Escalation

### On-Call Rotation

| Role             | Slack Handle | Phone           | Availability                |
| ---------------- | ------------ | --------------- | --------------------------- |
| On-Call Engineer | @on-call     | +1-XXX-XXX-XXXX | 24/7                        |
| Database Admin   | @db-admin    | +1-XXX-XXX-XXXX | Business hours + emergency  |
| DevOps Lead      | @devops      | +1-XXX-XXX-XXXX | Business hours + escalation |
| VP Operations    | @vp-ops      | +1-XXX-XXX-XXXX | Executive escalation        |

### Escalation Path

```
Issue Detected (Monitoring / User Report)
    ↓
On-Call Engineer paged
    ↓
Can fix in < 15 min?
  ├─ YES → Proceed with fix
  └─ NO → Page Database/DevOps Admin
           ↓
           Still unresolved in 15 min?
           └─ YES → Page VP Operations
                    ↓
                    Activate DR procedure
                    Declare disaster
```

---

## 6. Documentation & Training

### Required Reading

- [ ] This Disaster Recovery Plan
- [ ] Deployment Guide (DEPLOYMENT_GUIDE.md)
- [ ] CI/CD Pipeline documentation (CI_CD_PIPELINE.md)
- [ ] Runbooks for common incidents (TBD)

### Annual Training Requirements

- [ ] DR drill participation (mandatory)
- [ ] Database recovery certification
- [ ] Incident response simulation
- [ ] Security incident response training

### Runbooks (To Create)

- [ ] Database recovery runbook
- [ ] Application failover runbook
- [ ] Security incident response runbook
- [ ] Communication templates

---

## 7. Compliance & Auditing

### Regulatory Requirements

| Standard    | Requirement       | Evidence                                |
| ----------- | ----------------- | --------------------------------------- |
| **SOC 2**   | RTO ≤ 4 hours     | This DR plan + quarterly tests          |
| **GDPR**    | Backup encryption | AES-256 verified                        |
| **HIPAA**   | Data redundancy   | Cross-region replication                |
| **PCI DSS** | Incident logs     | Audit trail in dead_letter_queue + logs |

### Audit Trail

All disaster recovery actions logged in:

- PostgreSQL: `audit_logs` table (immutable)
- Application: Structured logs (JSON, time-series DB)
- Infrastructure: Cloud provider audit logs (CloudTrail, Stackdriver)

---

## 8. Related Documents

- [CI/CD Pipeline](CI_CD_PIPELINE.md) - Automated deployments
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Manual procedures
- [Secrets Rotation Policy](secrets-rotation-policy.md) - Key management
- [Production Checklist](../PRODUCTION_CHECKLIST.md) - Pre-launch verification
