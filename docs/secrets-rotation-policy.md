# Secrets Rotation Policy (Template)

This document defines an operational secrets rotation policy for the Denbegaye Agent Workers service. Follow this policy to minimize secrets exposure risk, comply with audit requirements, and ensure reliable secret updates.

## Scope

- Encryption keys (`ENCRYPTION_KEY`) used for API key vault and other AES-GCM encryption.
- Supabase service role keys and DB credentials.
- Redis auth tokens and TLS certs.
- Cloud provider credentials (AWS/GCP service accounts).
- Third-party API provider keys stored in `api_keys_vault`.

## Roles & Responsibilities

- **Security Owner:** Overall policy owner, responsible for policy updates and audits.
- **DevOps/Platform Team:** Executes rotation, validates deployments, and maintains automation scripts.
- **Developers:** Ensure applications can accept rotated secrets and support key versioning.
- **On-call/Incident Response:** Executes emergency rotation steps.

## Rotation Frequency (Recommended)

- **ENCRYPTION_KEY:** Rotate every 90 days or immediately after suspected compromise.
- **Supabase service role keys / DB admin credentials:** Rotate every 90 days.
- **Redis passwords:** Rotate every 90 days.
- **Third-party API keys:** Rotate per provider's recommendation or upon suspected compromise.

## Rotation Process Overview

1. **Prepare new key and test in staging**
   - Generate a new `ENCRYPTION_KEY` (32 random bytes; 64 hex characters).
   - Store new key in a secrets manager (HashiCorp Vault, AWS Secrets Manager, or Supabase encrypted secrets store).
   - Deploy a staging instance with the new key (read-only mode) and run validation.

2. **Re-encrypt data (if applicable)**
   - For key material stored in `api_keys_vault`, re-encrypt each `encrypted_key` using the new key.
   - Use an offline migration script to decrypt with the old key and re-encrypt with the new key.
   - Verify that all records can be decrypted with the new key before switching production.

3. **Rollout new key**
   - Use a canary rollout: update 1-2 instances to read the new key, verify metrics.
   - Update environment configuration for other instances gradually.
   - Monitor for errors related to decryption/auth failures.

4. **Rotate provider credentials**
   - For third-party keys (SendGrid, Google, OpenAI), follow provider-specific rotation mechanisms.
   - Update the `api_keys_vault` entries after new provider keys are issued.

5. **Audit & Verify**
   - Check audit logs for key use and rotation events.
   - Run smoke tests for workflow execution and API access.

6. **Retire old keys**
   - Once fully verified, retain previous keys in audit-only mode for 30 days, then securely delete.

## Emergency Rotation (Compromise Response)

1. Revoke compromised secret(s) immediately in the secret manager.
2. Generate replacement secret(s).
3. Run re-encryption (if data encrypted with compromised key) using a rotation script.
4. Update services to use new keys; perform canary validation.
5. Notify stakeholders and perform forensic analysis.

## Technical Details — ENCRYPTION_KEY

- Format: 32 bytes (256 bits) encoded as 64 hexadecimal characters.
- Storage: Secrets manager (Vault, AWS Secrets Manager, or environment variables in a protected deployment platform).
- Access control: Only CI/CD and the platform team may have write access. Application runtime should have read-only access scoped to the environment.

### Generating a new key (example)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Migration Script

A recommended script `src/scripts/rotate_api_keys.ts` is included in the repository. It performs the following steps:

- Reads `OLD_ENCRYPTION_KEY` and `NEW_ENCRYPTION_KEY` from environment variables.
- Fetches all records from `api_keys_vault`.
- Decrypts each encrypted key with the old key and re-encrypts with the new key.
- Supports `DRY_RUN=true` to preview changes without updating database records.

> Run the script with a Supabase service role key available in environment variables:

```bash
export SUPABASE_URL="<url>"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
export OLD_ENCRYPTION_KEY="<old-64-hex>"
export NEW_ENCRYPTION_KEY="<new-64-hex>"
export DRY_RUN=true
npx tsx src/scripts/rotate_api_keys.ts
```

## Audit & Logging

- All rotations must be logged with timestamp, operator, and affected resources.
- Store rotation logs in `usage_analytics` or a dedicated audit table for compliance.
- Implement monitoring alerts for decryption failures after a rotation.

## Testing & Validation

- Validate that services can decrypt and use re-encrypted keys.
- Run a battery of acceptance tests on staging prior to production rollout.
- Monitor error rates and metrics for 24–72 hours post-rotation.

## Post-Rotation Cleanup

- Keep old keys in a secure archive for 30 days for rollback purposes; then securely delete.
- Update documentation and runbook with rotation details and timestamps.

## Automation & CI/CD Integration

- Integrate rotation scripts into a CI job with restricted permissions.
- Ensure rotation requires manual approval (protected deploy) in production.

## Compliance

- Align rotation frequency and audit logging with applicable regulations (GDPR, HIPAA, ISO27001).

---

_This is a template; adapt schedules and controls according to organizational policies._
