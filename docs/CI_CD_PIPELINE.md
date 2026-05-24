# CI/CD Pipeline Documentation

## Overview

This project uses **GitHub Actions** for continuous integration and deployment. The pipeline automates testing, linting, type checking, security scanning, and deployments across multiple environments.

## Workflow Triggers

The CI/CD pipeline triggers on:

- **Push events** to `main`, `develop`, or `staging` branches
- **Pull requests** targeting `main`, `develop`, or `staging` branches

## Pipeline Stages

### 1. **Lint & TypeScript Check** (Parallel)

**Runs on:** Node 18.x and 20.x

- Installs dependencies (`npm ci`)
- Runs ESLint for code style checks (`npm run lint`)
- Validates TypeScript types (`npx tsc --noEmit`)
- Checks for unused imports (`npm run check-imports`)

**Failures:** Non-blocking (allows continue on error) to prevent blocking PRs

---

### 2. **Unit Tests**

**Runs on:** Node 20.x with Redis service

- Spins up a Redis 7-alpine container for integration tests
- Runs test suite with coverage reporting (`npm test -- --coverage`)
- Uploads coverage reports to Codecov
- Tests can fail without blocking build (pass with no tests)

**Environment:** `REDIS_URL=redis://localhost:6379`

---

### 3. **Build Application**

**Runs on:** Node 20.x (depends on lint + test)

- Compiles TypeScript to `dist/` directory
- Verifies build output exists and reports size
- Blocks pipeline if build fails

---

### 4. **Security Checks**

**Runs on:** Node 20.x (parallel with build)

- **npm audit:** Scans dependencies for vulnerabilities (moderate level)
- **TruffleHog:** Detects accidentally committed secrets (staging, API keys, etc.)

**Failures:** Non-blocking to prevent deployment delays

---

### 5. **Database Migrations Check**

**Runs on:** Ubuntu (parallel with build)

- Verifies SQL migration files exist in `src/migrations/`
- Validates basic SQL syntax (checks for statement terminators)
- Warns if no migrations present

---

### 6. **Docker Build**

**Triggered:** Only on push to `main` branch

- Builds Docker image for registry (GHCR)
- Tags with `latest` and commit SHA
- Uses layer caching for faster builds
- Non-blocking failure

---

### 7. **Deploy to Staging**

**Triggered:** Push to `develop` branch

- Runs after build + security + migrations checks pass
- Uses staging environment secrets:
  - `STAGING_SUPABASE_URL`
  - `STAGING_SUPABASE_SERVICE_ROLE_KEY`
  - `STAGING_REDIS_URL`
- Deployment endpoint: `https://staging.denbegaye-workers.dev`

---

### 8. **Deploy to Production**

**Triggered:** Push to `main` branch

- Runs after build + security + migrations checks pass
- Uses production environment secrets:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `REDIS_URL`
- Deployment endpoint: `https://denbegaye-workers.dev`
- **Requires manual approval** (via GitHub environment protection rules)

---

## Required GitHub Secrets

Configure these secrets in **Settings → Secrets and variables → Actions:**

### Development/Staging

| Secret                              | Description                         |
| ----------------------------------- | ----------------------------------- |
| `STAGING_SUPABASE_URL`              | Supabase URL for staging database   |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Service role key for staging        |
| `STAGING_REDIS_URL`                 | Redis connection string for staging |

### Production

| Secret                      | Description                            |
| --------------------------- | -------------------------------------- |
| `SUPABASE_URL`              | Supabase URL for production database   |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for production        |
| `REDIS_URL`                 | Redis connection string for production |
| `ENCRYPTION_KEY`            | 64-character hex encryption key        |

### Optional

| Secret          | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `CODECOV_TOKEN` | Codecov integration token (auto-included via GitHub token) |

---

## Environment Variables

The workflow sets these for all jobs:

```yaml
NODE_ENV: test|production (context-dependent)
SERVICE_ROLE: all # Enable all worker threads
SUPABASE_URL: <from secrets>
SUPABASE_SERVICE_ROLE_KEY: <from secrets>
REDIS_URL: redis://localhost:6379 (local) or <from secrets> (deploy)
ENCRYPTION_KEY: <from secrets>
```

---

## Pipeline Dependencies

```
Build & Test CI/CD
├── Lint & TypeScript Check (Node 18.x, 20.x)
├── Unit Tests (Redis service, Node 20.x)
│
├── Build Application (depends on: Lint + Test)
├── Security Checks (parallel with Build)
├── Migrations Check (parallel with Build)
│
├── Docker Build (main branch only, depends on Build)
│
├── Deploy Staging (develop branch, depends on Build + Security + Migrations)
└── Deploy Production (main branch, depends on Build + Security + Migrations)
```

---

## Local Development

To simulate CI/CD locally:

```bash
# Install dependencies
npm ci

# Run linting
npm run lint

# Type check
npx tsc --noEmit

# Run tests
npm test -- --coverage

# Build
npm run build

# Run npm audit
npm audit --audit-level=moderate
```

---

## Debugging Failed Workflows

### Check Logs

1. Go to **Actions** tab in GitHub
2. Click failed workflow run
3. Expand step logs to see detailed errors

### Common Failures

| Error             | Solution                                              |
| ----------------- | ----------------------------------------------------- |
| `npm ci` fails    | Check `package-lock.json` is committed and up-to-date |
| TypeScript errors | Run `npx tsc --noEmit` locally to debug               |
| Test failures     | Ensure Redis is running; check `.test.ts` files       |
| Build fails       | Verify `npm run build` works locally                  |
| Deployment fails  | Check environment secrets are set correctly           |

### Re-run Failed Jobs

1. Click **Re-run failed jobs** button in Actions tab
2. Or manually trigger: **Run workflow** → select branch

---

## Branch Strategy

- **main**: Production-ready code
  - Triggers: Build + Security + Docker + Deploy Production
  - Requires: PR review + passing all checks
- **develop**: Staging/integration branch
  - Triggers: Build + Security + Deploy Staging
  - Requires: PR review + passing lint & tests
- **feature/\***: Feature branches
  - Triggers: Build + Lint + Tests only
  - No automatic deployment

---

## Performance Notes

- **Node 18.x tests**: Secondary matrix for compatibility
- **Redis service**: Pre-warmed in test job (health checks)
- **npm ci**: Uses lockfile for deterministic installs
- **Cache strategy**: npm module caching speeds up runs by 30-40%

---

## Next Steps

1. **Add branch protection rules** (main/develop):
   - Require status checks pass (lint, test, build)
   - Require PR review
   - Dismiss stale PR approvals on new push

2. **Configure deployment approvals** (production only):
   - Settings → Environments → production
   - Add required reviewers
   - Set auto-merge restrictions

3. **Monitor deployments**:
   - Set up Slack notifications (optional)
   - Track deployment history in Actions tab
   - Review failed jobs within 24 hours

4. **Quarterly review**:
   - Update Node.js versions as needed
   - Review security audit findings
   - Optimize step times based on metrics

---

## Support & Troubleshooting

For CI/CD issues:

1. Check [GitHub Actions documentation](https://docs.github.com/en/actions)
2. Review workflow file at `.github/workflows/build.yml`
3. Enable debug logging: Add secret `ACTIONS_STEP_DEBUG: true`
4. Contact DevOps team for infrastructure issues
