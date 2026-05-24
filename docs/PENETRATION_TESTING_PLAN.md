# Penetration Testing & Security Assessment Plan

## Executive Summary

This document outlines a comprehensive security assessment strategy for the Denbegaye Agent Workers platform. It includes annual penetration testing, quarterly vulnerability assessments, security incident response procedures, and compliance validation against OWASP Top 10, GDPR, and SOC 2 standards.

---

## 1. Security Assessment Objectives

### Goals

1. **Identify & Remediate Vulnerabilities**
   - OWASP Top 10 coverage
   - Infrastructure security gaps
   - API security weaknesses
   - Authentication/authorization flaws

2. **Validate Compliance**
   - SOC 2 Type II controls
   - GDPR data privacy
   - CCPA data protection
   - PCI DSS (if processing payments)

3. **Establish Security Baselines**
   - Penetration test results
   - Vulnerability metrics
   - Risk scoring matrix
   - Security posture trending

4. **Improve Security Culture**
   - Developer training
   - Security code review practices
   - Incident response readiness

---

## 2. Penetration Testing Program

### Annual Penetration Test

**Schedule:** Q2 (April-May) yearly

**Scope:**

- REST API endpoints (/api/\*)
- WebSocket handlers (/stream)
- Webhook processing (/webhook/\*)
- Authentication & JWT validation
- Admin dashboard
- Database connectivity
- Redis security
- Infrastructure (if applicable)

**Methodology:** OWASP Testing Guide v4.2

**Deliverable:** Professional pentest report with:

- Executive summary
- Detailed vulnerability findings
- CVSS severity ratings
- Remediation recommendations
- Timeline for fixes

**Cost:** $15,000 - $30,000 (varies by scope)

**Vendor:** Hire external firm (e.g., Synack, Bugcrowd, local security firm)

---

## 3. Manual Security Checklist

### Pre-Deployment Security Review

Before every production deployment, verify:

#### Authentication & Authorization

- [ ] JWT tokens validated on every authenticated request
- [ ] JWT signature verified (no tampering)
- [ ] JWT expiration checked
- [ ] Refresh tokens rotated properly
- [ ] API keys never logged or exposed
- [ ] Role-based access control (RBAC) enforced
- [ ] User cannot access other users' data
- [ ] Admin endpoints require admin role
- [ ] Rate limiting blocks brute force attacks

#### API Security

- [ ] CORS headers correct (no wildcard `*`)
- [ ] CSRF tokens used for state-changing requests
- [ ] SQL injection prevented (parameterized queries)
- [ ] NoSQL injection prevented
- [ ] Command injection prevented
- [ ] Path traversal prevented
- [ ] XXE (XML External Entity) attacks prevented
- [ ] Request size limits enforced (10MB default)
- [ ] Timeout handling prevents hanging connections

#### Data Protection

- [ ] Sensitive data encrypted in transit (TLS 1.3)
- [ ] Sensitive data encrypted at rest (AES-256-GCM)
- [ ] Encryption keys managed securely (not in code)
- [ ] Password hashing using bcrypt (10+ rounds)
- [ ] PII masked in logs
- [ ] API keys not stored in plaintext
- [ ] Secrets rotation working
- [ ] Backup encryption verified

#### Error Handling

- [ ] Stack traces not exposed in production
- [ ] Generic error messages to users (`"Error processing request"`)
- [ ] Detailed logs only in monitoring system
- [ ] No sensitive data in error responses
- [ ] 500 errors trigger alerts

#### Deployment Security

- [ ] Secrets loaded from environment (not hardcoded)
- [ ] GitHub secrets configured (SUPABASE_URL, API keys, etc.)
- [ ] No `.env` file committed
- [ ] No private keys in repo
- [ ] Build artifacts not committed
- [ ] Third-party dependencies audited (`npm audit`)
- [ ] Dependency versions locked (package-lock.json)

#### Infrastructure

- [ ] HTTPS enforced (no HTTP traffic)
- [ ] Security headers set (CSP, X-Frame-Options, etc.)
- [ ] Database connections use private network (not public internet)
- [ ] Redis password configured (not public)
- [ ] Firewall rules restrict access
- [ ] DDoS protection enabled (Cloudflare, AWS Shield, etc.)
- [ ] WAF (Web Application Firewall) configured

#### Monitoring & Logging

- [ ] Error tracking active (Sentry, DataDog)
- [ ] Audit logs immutable
- [ ] Failed login attempts logged
- [ ] Suspicious activity alerts configured
- [ ] Log retention policy enforced
- [ ] PII not logged

---

## 4. Vulnerability Assessment Program

### Quarterly Vulnerability Scan

**Tools:** OWASP ZAP, Burp Suite Community, npm audit

**Frequency:** Every 3 months

**Process:**

```bash
# 1. Dependency scan
npm audit --audit-level=moderate
npm audit fix  # Auto-fix if safe

# 2. SAST (Static Application Security Testing)
# Using ESLint + security plugins
npm run lint

# 3. DAST (Dynamic Application Security Testing)
# Run on staging environment
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://staging.denbegaye-workers.dev

# 4. Manual code review
# Focus on: auth, crypto, injection points
```

### Remediation SLA

| Severity                  | Fix Timeline | Escalation                     |
| ------------------------- | ------------ | ------------------------------ |
| **Critical** (CVSS 9.0+)  | 24 hours     | Page security lead immediately |
| **High** (CVSS 7.0-8.9)   | 7 days       | Add to sprint immediately      |
| **Medium** (CVSS 4.0-6.9) | 30 days      | Next planning cycle            |
| **Low** (CVSS 0.1-3.9)    | 90 days      | Backlog (fix when convenient)  |

---

## 5. OWASP Top 10 Coverage

### Automated Testing

For each vulnerability class, validate mitigations:

#### 1. Broken Access Control

```javascript
// Test: User cannot access other users' data
GET /api/agents?userId=OTHER_USER_ID
// Expected: 403 Forbidden or empty list
```

**Mitigations:**

- ✅ Row-Level Security (RLS) in Supabase
- ✅ Authorization check before data access
- ✅ User ID verified from JWT (not from request)

#### 2. Cryptographic Failures

```bash
# Test: Encryption at rest
SELECT encrypted_key FROM api_keys_vault LIMIT 1;
# Expected: Looks like ciphertext (binary/hex), not plaintext
```

**Mitigations:**

- ✅ AES-256-GCM for all sensitive data
- ✅ TLS 1.3 for all data in transit
- ✅ ENCRYPTION_KEY rotated every 90 days

#### 3. Injection (SQL, NoSQL, Command, etc.)

```bash
# Test: SQL injection attempt
curl -H "Auth: Bearer token" \
  "https://denbegaye-workers.dev/api/agents?search='; DROP TABLE agents; --"
# Expected: No error, safe handling
```

**Mitigations:**

- ✅ Parameterized queries (Supabase library uses them)
- ✅ Input validation (joi/zod schemas)
- ✅ Output encoding (JSON-safe responses)

#### 4. Insecure Design (SSRF, XXE, etc.)

```javascript
// Test: Cannot access internal services
const response = await fetch("http://localhost:6379/");
// Expected: Connection error, external URL blocked
```

**Mitigations:**

- ✅ Network segmentation (private VPC)
- ✅ Firewall rules block internal access
- ✅ XML parsing disabled
- ✅ SSRF protection: validate URLs before fetch

#### 5. Security Misconfiguration

```bash
# Test: No default credentials
curl -u admin:admin https://denbegaye-workers.dev
# Expected: 401 Unauthorized

# Test: Debug endpoints disabled
curl https://denbegaye-workers.dev/debug
# Expected: 404 Not Found
```

**Mitigations:**

- ✅ DEBUG mode off in production
- ✅ Admin endpoints hidden behind auth
- ✅ Unnecessary services disabled
- ✅ Directory listing disabled

#### 6. Vulnerable & Outdated Components

```bash
# Automated check in CI/CD
npm audit --audit-level=moderate

# Manual check
npm outdated
```

**Mitigations:**

- ✅ Quarterly dependency updates
- ✅ npm audit in CI pipeline
- ✅ Deprecated packages removed
- ✅ Critical patches applied immediately

#### 7. Authentication & Session Management

```bash
# Test: JWT expiration enforced
export JWT_EXPIRED=true
curl -H "Authorization: Bearer $JWT_EXPIRED" \
  https://denbegaye-workers.dev/api/agents
# Expected: 401 Unauthorized

# Test: CSRF protection
POST /api/agents/delete
# Without CSRF token expected
# Expected: 403 if form-encoded, 200 if JSON
```

**Mitigations:**

- ✅ JWT validation on every request
- ✅ 1-hour token expiration
- ✅ Refresh token rotation
- ✅ CSRF tokens for state-changing requests
- ✅ Secure cookie flags (HttpOnly, SameSite)

#### 8. Software & Data Integrity Failures

```bash
# Test: Dependency integrity verified
npm ci  # Uses package-lock.json (not package.json)
npm verify-tree  # Validate dependency structure
```

**Mitigations:**

- ✅ package-lock.json committed & verified
- ✅ npm ci used (not npm install)
- ✅ Code signed & verified in CI/CD
- ✅ Supply chain security (SCA tools)

#### 9. Logging & Monitoring Failures

```bash
# Test: Sensitive data not logged
grep -r "password\|api_key\|secret" logs/
# Expected: No matches
```

**Mitigations:**

- ✅ Audit logs immutable (Supabase RLS)
- ✅ PII redacted in application logs
- ✅ Failed login attempts logged
- ✅ Suspicious activity triggers alerts

#### 10. Server-Side Request Forgery (SSRF)

```javascript
// Test: Cannot abuse webhook functionality
POST /api/webhook
{
  "url": "http://internal-redis:6379/FLUSHALL"
}
// Expected: 400 Bad Request (internal URL blocked)
```

**Mitigations:**

- ✅ URL validation (must be public internet)
- ✅ Internal IP ranges blocked (127.0.0.1, 10.0.0.0/8, etc.)
- ✅ DNS rebinding protection
- ✅ Webhook timeout < 10 seconds

---

## 6. Security Testing Scripts

### Automated Security Test Suite

```bash
#!/bin/bash
# scripts/security-test.sh

set -e

echo "=== Security Assessment ==="

echo "1. Dependency Audit"
npm audit --audit-level=moderate || exit 1

echo "2. SAST (Static Code Analysis)"
npm run lint || true

echo "3. TypeScript Type Checking"
npx tsc --noEmit || exit 1

echo "4. Secrets Detection (TruffleHog)"
docker run -v "$(pwd)":/scan trufflesecurity/trufflehog filesystem /scan \
  --json --fail || true

echo "5. Container Scanning (Trivy)"
# If building Docker images
# trivy image --severity HIGH,CRITICAL denbegaye-workers:latest || true

echo "6. Infrastructure as Code (tfsec)"
# If using Terraform/CloudFormation
# tfsec . --exit-code 1 || true

echo "=== Security Assessment Complete ==="
```

**Run:**

```bash
chmod +x scripts/security-test.sh
./scripts/security-test.sh
```

### Manual Penetration Testing Checklist

```markdown
# Manual Penetration Test Checklist

## Authentication

- [ ] Brute force attacks blocked (rate limiting)
- [ ] Password reset tokens expire
- [ ] Session hijacking prevented (secure cookies)
- [ ] MFA bypass not possible
- [ ] JWT kid parameter checked (not ignored)

## Authorization

- [ ] Horizontal privilege escalation prevented (cannot modify other users)
- [ ] Vertical privilege escalation prevented (cannot become admin)
- [ ] Direct object reference protected (user ID in request checked)

## API Security

- [ ] API version parameter not used for auth bypass
- [ ] Deprecated API endpoints removed
- [ ] API key rotation working
- [ ] Request/response logging doesn't expose secrets

## WebSocket Security

- [ ] Message origin validated
- [ ] Message size limits enforced
- [ ] Connection timeout working
- [ ] Unsubscribe/disconnect proper cleanup

## File Upload (if applicable)

- [ ] File type validated (not just extension)
- [ ] File size limited
- [ ] Uploaded files not executable
- [ ] Path traversal prevented (../../../etc/passwd)

## Data Exposure

- [ ] PII not in URLs (use POST/body)
- [ ] Sensitive data in error responses redacted
- [ ] API responses don't leak internal structure
- [ ] List endpoints paginated (no mass data export)

## Business Logic

- [ ] Race conditions prevented (concurrent requests)
- [ ] Duplicate charge prevention (idempotency keys)
- [ ] Workflow state validation (cannot skip steps)
- [ ] Timestamp validation (cannot set future dates)

## External Integrations

- [ ] Third-party API keys validated
- [ ] Webhook signatures verified
- [ ] Callback URLs whitelist enforced
- [ ] Rate limits from external APIs respected
```

---

## 7. Compliance Validation

### SOC 2 Type II Evidence

| Control           | Evidence                                | Audit Frequency |
| ----------------- | --------------------------------------- | --------------- |
| Access Control    | RBAC enforcement, audit logs            | Quarterly       |
| Data Encryption   | AES-256 TLS verification                | Annually        |
| Change Management | CI/CD approval logs, deployment records | Quarterly       |
| Incident Response | Incident response plan, test results    | Semi-annually   |
| Backup & Recovery | DR test results, backup verification    | Semi-annually   |
| Monitoring        | Alert configuration, log retention      | Quarterly       |

### GDPR Compliance Checklist

- [ ] Consent obtained before data collection
- [ ] Privacy policy up-to-date and linked
- [ ] Data subject rights implemented (export, delete)
- [ ] Data Protection Impact Assessment (DPIA) completed
- [ ] Processor agreements in place (Supabase, cloud providers)
- [ ] Data breach notification procedure documented
- [ ] Data retention policy enforced (auto-purge)
- [ ] Encryption keys managed securely

### CCPA Compliance Checklist

- [ ] Consumer rights disclosed (CA Privacy Notice)
- [ ] Opt-out mechanism implemented
- [ ] Data sale/sharing opt-out available
- [ ] Data inventory documented
- [ ] Deletion request honored within 45 days
- [ ] Do Not Sell My Personal Information link prominent

---

## 8. Security Incident Response

### Incident Classification

| Level        | Response Time | Example                                       |
| ------------ | ------------- | --------------------------------------------- |
| **Critical** | 30 min        | Data breach, system compromise, RCE           |
| **High**     | 2 hours       | Account takeover, malware detected, DDoS      |
| **Medium**   | 8 hours       | Vulnerability discovered, unauthorized access |
| **Low**      | 24 hours      | Policy violation, configuration issue         |

### Incident Response Process

1. **Detect** (automated alerts or manual report)
2. **Activate** (incident commander declared, team paged)
3. **Assess** (scope, impact, containment strategy)
4. **Contain** (stop spread, revoke keys, patch)
5. **Investigate** (root cause, timeline, affected parties)
6. **Notify** (customers, legal, regulators if required)
7. **Recover** (restore service, verify integrity)
8. **Review** (postmortem, preventative measures)

**Runbook Location:** `/docs/incident-response-runbook.md` (to be created)

---

## 9. Bug Bounty Program (Optional)

### HackerOne or Bugcrowd Integration

- Establish responsible disclosure policy
- Set bounty amounts by severity
- Triage and remediate disclosed vulnerabilities
- Public recognition for researchers (if approved)

**Budget:** $5,000-$20,000/year depending on scope

**Process:**

1. Researcher discovers vulnerability
2. Submits via Bugcrowd/HackerOne
3. Engineering verifies
4. Fix timeline negotiated
5. Patch released
6. Bounty paid + recognition

---

## 10. Security Training & Culture

### Developer Security Training

**Annual Requirements:**

- [ ] OWASP Top 10 overview
- [ ] Secure coding practices
- [ ] Authentication & authorization
- [ ] Data protection & privacy
- [ ] Incident response procedures

**Resources:**

- PluralSight security courses
- OWASP Testing Guide
- Internal security wiki

### Code Review Security Checklist

Every PR includes:

- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] Output encoding present
- [ ] Authentication/authorization checked
- [ ] Error messages generic (no internal details)
- [ ] No SQL injection risks
- [ ] No XXE/SSRF risks

---

## 11. Monitoring & Alerting

### Security Events to Monitor

```
Monitored Events:
├── Failed login attempts (> 5 per minute)
├── SQL errors in logs (injection attempts)
├── 401/403 responses spike
├── Rate limit violations (brute force)
├── Unauthorized API access attempts
├── Database query errors
├── File upload rejections
├── Webhook delivery failures
├── Certificate expiration warnings (< 30 days)
└── Dependency vulnerability advisories
```

**Alert Channels:**

- Slack #security channel (all events)
- PagerDuty (critical only)
- Email digest (daily summary)

---

## 12. Testing Schedule

### Annual Security Calendar

```
January:   Security training (all developers)
February:  Dependency audit update
March:     Quarterly vulnerability scan
April-May: Annual penetration test
June:      GDPR/CCPA audit
July:      DR test
August:    Quarterly vulnerability scan
September: Incident response drill
October:   Quarterly vulnerability scan
November:  Bug bounty triage
December:  Year-end security review
```

---

## 13. Reporting & Metrics

### Security Dashboard Metrics

Track over time:

- Critical vulnerabilities: 0 (always)
- High vulnerabilities: < 3 (fix within 7 days)
- Medium vulnerabilities: < 10 (fix within 30 days)
- Low vulnerabilities: < 20 (fix within 90 days)
- Dependency age: < 6 months old (for major versions)
- Penetration test findings: Decreasing trend year-over-year

---

## 14. Contacts & Escalation

### Security Team

| Role          | Slack          | Email                  | Phone        |
| ------------- | -------------- | ---------------------- | ------------ |
| Security Lead | @security-lead | security@denbegaye.dev | (on-call)    |
| CTO           | @cto           | cto@denbegaye.dev      | (escalation) |

### Reporting Security Issues

**External Researchers:**

- Email: security@denbegaye.dev
- Include: Vulnerability description, affected component, impact
- PGP: Use key from https://denbegaye.dev/security.gpg (to be created)

**Internal Team:**

- Slack: #security (private)
- Email: security@denbegaye.dev
- PagerDuty: Page security on-call

---

## 15. Next Steps

1. **Week 1:** Perform manual security checklist above
2. **Week 2:** Set up automated security scanning (npm audit in CI/CD)
3. **Week 3:** Plan annual penetration test (Q2 2026)
4. **Week 4:** Document incident response runbook
5. **Month 2:** Implement bug bounty program (optional)
6. **Quarter 2:** Execute penetration test, remediate findings

---

## Related Documents

- [SLA Agreement](SLA_AGREEMENT.md) - Security commitments
- [Disaster Recovery Plan](DISASTER_RECOVERY_PLAN.md) - Incident response
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Infrastructure security
- [Secrets Rotation Policy](secrets-rotation-policy.md) - Key management
