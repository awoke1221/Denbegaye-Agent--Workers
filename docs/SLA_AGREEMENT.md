# Service Level Agreement (SLA) Template

## 1. Service Description

### Overview

The Denbegaye Agent Workers platform provides a scalable, multi-tenant workflow orchestration and agent execution system for enterprise automation and AI-driven task processing.

### Service Components

| Component           | Description                                              | Tier     |
| ------------------- | -------------------------------------------------------- | -------- |
| **REST API**        | /api/agent-run, /api/langgraph/execute, agent management | Core     |
| **Job Queue**       | Async job processing via BullMQ + Redis                  | Core     |
| **WebSocket**       | Real-time execution streaming & notifications            | Core     |
| **Webhooks**        | Inbound and outbound webhook handlers                    | Core     |
| **Email Service**   | Transactional & scheduled email delivery                 | Standard |
| **Admin Dashboard** | User, agent, and job management UI                       | Standard |
| **Vector Memory**   | Semantic search & memory persistence                     | Optional |
| **Rate Limiting**   | Per-IP, per-user, per-route quota enforcement            | Core     |

---

## 2. Service Level Targets

### Availability SLA

| Metric                     | Target | Monthly Allowance   |
| -------------------------- | ------ | ------------------- |
| **API Availability**       | 99.9%  | 43 minutes downtime |
| **Job Queue Availability** | 99.5%  | 3.6 hours downtime  |
| **Authentication/Auth**    | 99.95% | 22 minutes downtime |
| **Dashboard Availability** | 95%    | 36 hours downtime   |

### Performance SLA

| Metric                           | Target  | Notes                            |
| -------------------------------- | ------- | -------------------------------- |
| **API Response Time (P95)**      | < 200ms | RESTful endpoints (no streaming) |
| **API Response Time (P99)**      | < 500ms | 99th percentile                  |
| **Job Processing Latency (P50)** | < 5s    | From queue to start execution    |
| **Job Processing Latency (P95)** | < 30s   | 95th percentile (includes retry) |
| **WebSocket Connection Time**    | < 1s    | Establish live stream            |
| **Webhook Response Time**        | < 2s    | Inbound webhook processing       |

### Reliability SLA

| Metric                    | Target | Definition                                    |
| ------------------------- | ------ | --------------------------------------------- |
| **Error Rate**            | < 0.5% | 5xx errors / total requests                   |
| **Data Loss**             | 0%     | Zero tolerance for permanent data loss        |
| **Job Execution Failure** | < 0.1% | Jobs failed > 3 retries / total jobs          |
| **Queue Backlog**         | < 10%  | Processed jobs / submitted jobs (24h rolling) |

---

## 3. Service Credits

Customers entitled to service credits if SLA is not met:

### API Availability Credits

| Availability Range | Monthly Credit   |
| ------------------ | ---------------- |
| 99.5% - 99.89%     | 10% monthly fee  |
| 99.0% - 99.49%     | 25% monthly fee  |
| 95.0% - 98.99%     | 50% monthly fee  |
| < 95.0%            | 100% monthly fee |

### Process

1. Customer reports SLA breach within 7 days
2. Engineering validates outage & duration (pulls metrics from monitoring)
3. Credit calculated based on availability table above
4. Credit applied to next month's invoice automatically
5. No manual claim process required

---

## 4. Maintenance Windows

### Scheduled Maintenance

**Standard Maintenance Window:** Sundays 2:00 AM - 6:00 AM UTC

- No SLA guarantees during maintenance windows
- 7-day advance notice provided via email & status page
- Typically 1-2 hours of actual downtime
- Emergency maintenance: 24-hour notice when possible

### Emergency Maintenance (Unscheduled)

- Security patches: Immediate deployment (no notice)
- Critical bugs: Same-day deployment (best-effort notice)
- Database migrations: Coordinated with customers (DMs + email)

---

## 5. Incident Response SLA

### Response Times

| Severity          | Response SLA | Resolution SLA | Example                                    |
| ----------------- | ------------ | -------------- | ------------------------------------------ |
| **P1 - Critical** | 15 minutes   | 2 hours        | Service unavailable for > 1% users         |
| **P2 - High**     | 1 hour       | 4 hours        | Degraded performance, feature broken       |
| **P3 - Medium**   | 4 hours      | 1 day          | Single user impacted, non-critical feature |
| **P4 - Low**      | 24 hours     | 7 days         | Documentation gap, cosmetic issue          |

### Escalation Path

```
Initial Report (user/monitoring)
    ↓
Level 1: On-Call Support (15 min response)
    ├─ Can resolve? YES → Fix & close
    └─ Can resolve? NO → Escalate to Engineering
        ↓
        Level 2: Engineering Team (30 min response)
        ├─ Can resolve? YES → Fix & close
        └─ Can resolve? NO → Escalate to Lead
            ↓
            Level 3: Engineering Lead (1 hour response)
            └─ Activate incident command center
```

---

## 6. Support Channels & Hours

### Tier 1 - Free & Pro Plans

| Channel         | Hours                        | Response Time |
| --------------- | ---------------------------- | ------------- |
| Email Support   | Business hours (9am-5pm UTC) | 24 hours      |
| Community Forum | Community-driven             | Varies        |
| Documentation   | 24/7                         | Self-service  |

### Tier 2 - Enterprise Plans

| Channel            | Hours                      | Response Time             |
| ------------------ | -------------------------- | ------------------------- |
| Email Support      | 24/7                       | 1 hour (P1), 4 hours (P2) |
| Slack Integration  | 24/7                       | 30 minutes (P1)           |
| Phone Support      | Business hours + emergency | 15 minutes (P1)           |
| Dedicated Engineer | 24/7                       | On-call rotation          |

---

## 7. Excluded from SLA

The following are **NOT covered** by SLA guarantees:

- Scheduled maintenance windows (7+ days notice)
- Issues caused by customer misuse or misconfiguration
- Third-party service outages (Supabase, AWS, SendGrid)
- Natural disasters or force majeure events
- DDoS attacks or security incidents (separate incident response)
- Customer's own infrastructure/network issues
- Problems during customer onboarding (unless platform bug)
- Features marked as "Beta" or "Experimental"

---

## 8. Monitoring & Metrics

### Uptime Monitoring

Real-time monitoring at https://status.denbegaye-workers.dev/

```bash
# Health check endpoints
GET /api/health                        # Basic health
GET /api/health/advanced               # Detailed status
GET /api/health/db                     # Database connectivity
GET /api/health/redis                  # Cache connectivity
```

### Metrics Dashboard

- **Public:** status.denbegaye-workers.dev (uptime, incident history)
- **Customer:** Dashboard at denbegaye-workers.dev/metrics
- **Internal:** Prometheus + Grafana (ops-only)

### Data Retention

- Real-time metrics: 7 days
- Hourly aggregated: 3 months
- SLA calculations: 3 years (compliance)

---

## 9. Disaster Recovery SLA

### RTO & RPO Commitments

| Scenario             | RTO (Recovery Time) | RPO (Data Loss)     | Plan                         |
| -------------------- | ------------------- | ------------------- | ---------------------------- |
| **Data Corruption**  | 1 hour              | 1 hour              | Point-in-time restore        |
| **Complete DB Loss** | 4 hours             | 24 hours            | S3 backup restore            |
| **Redis Failure**    | 15 minutes          | 0 (rebuilt from DB) | Automatic failover           |
| **App Crash**        | 5 minutes           | 0                   | Auto-restart + health checks |
| **Regional Outage**  | 2 hours             | 1 hour              | Secondary region failover    |

See [Disaster Recovery Plan](DISASTER_RECOVERY_PLAN.md) for details.

---

## 10. Data Commitments

### Data Security

- **Encryption at rest:** AES-256-GCM
- **Encryption in transit:** TLS 1.3
- **Backup encryption:** AES-256-GCM in cloud storage
- **Key rotation:** 90-day policy (or immediate if compromised)

### Data Retention & Deletion

| Data Type         | Retention          | Deletion Method               |
| ----------------- | ------------------ | ----------------------------- |
| **User Accounts** | Until user deletes | Soft delete + purge (30 days) |
| **Job History**   | 90 days            | Automatic purge               |
| **Logs**          | 30 days            | Automatic purge               |
| **Audit Logs**    | 7 years            | Compliance retention          |
| **Backups**       | 30 days            | S3 auto-expiration            |

### User Data Rights

- **Export:** API available, JSON format, within 24 hours
- **Deletion:** Soft delete on demand, purged in 30 days
- **Correction:** User can update own profile anytime
- **Portability:** Export full history as JSON

---

## 11. Compliance & Standards

### Industry Certifications

- [ ] **SOC 2 Type II** - Security, availability, integrity, confidentiality
- [ ] **GDPR** - Data privacy & user rights (EU)
- [ ] **CCPA** - Data privacy & user rights (California)
- [ ] **HIPAA** - Healthcare data protection (if applicable)

### Audit Requirements

- Quarterly: SLA metrics review (internal)
- Semi-annually: Security audit (third-party)
- Annually: Penetration test (external firm)
- Annually: DR drill validation

---

## 12. Communication & Status Updates

### Status Page

- **URL:** https://status.denbegaye-workers.dev
- **Updated:** Every 30 minutes during incidents
- **Format:** Incident timeline, component status, ETA

### Email Notifications

All customers receive:

- Planned maintenance: 7 days advance notice
- Incidents: 30 min after detection (P1), 2 hours (P2)
- Resolution: Within 30 min of fix
- Postmortem: 48 hours after incident

### Escalation Contacts

For SLA breach disputes or critical issues:

```
Customer Success Team: success@denbegaye.dev
Engineering Manager: engineering@denbegaye.dev
Executive Escalation: ceo@denbegaye.dev
```

---

## 13. SLA Review & Updates

### Annual Review

This SLA is reviewed annually and adjusted based on:

- Historical performance data
- Customer feedback
- Industry benchmarks
- Technology changes

### Change Notice

- SLA changes: 30-day advance notice (email)
- Effective date: First day of calendar month
- Downgrades require explicit customer acknowledgment
- Upgrades effective immediately

---

## 14. Dispute Resolution

### SLA Breach Claim Process

1. **Report:** Email success@denbegaye.dev with evidence
2. **Validation:** Engineering reviews logs & metrics (3 business days)
3. **Calculation:** Support calculates credit due
4. **Application:** Credit applied to next invoice (auto)
5. **Appeal:** If disputed, escalate to engineering@denbegaye.dev

### Limitation of Liability

This SLA is the customer's exclusive remedy for service failures. Except as required by law, neither party is liable for:

- Indirect or consequential damages
- Lost revenue, profit, or data
- Damages exceeding service fees paid

---

## 15. Agreement Acceptance

By using Denbegaye Agent Workers platform, you agree to this SLA.

- **Effective Date:** January 1, 2024
- **Last Updated:** May 24, 2026
- **Version:** 2.1

### Contact Us

- **Website:** https://denbegaye-workers.dev
- **Email:** support@denbegaye.dev
- **Slack:** #support (for enterprise customers)
- **Docs:** https://docs.denbegaye-workers.dev
