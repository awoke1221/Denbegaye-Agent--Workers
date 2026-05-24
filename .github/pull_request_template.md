## Description

<!-- Provide a clear and concise description of the changes -->

Fixes #(issue number)

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Dependency upgrade
- [ ] Infrastructure/DevOps change

## Changes Made

<!-- List the specific changes in this PR -->

- Change 1
- Change 2
- Change 3

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] No new tests needed (explain why)

### Test Coverage

<!-- Describe how you tested this change -->

- Tested locally on Node 20.x with Redis
- Verified TypeScript types with `npx tsc --noEmit`
- Ran full test suite: `npm test`

## CI/CD Checklist

<!-- The following will be automatically verified by GitHub Actions -->

- [ ] All CI checks pass (lint, typecheck, tests, build)
- [ ] Security audit passes (`npm audit --audit-level=moderate`)
- [ ] No secrets or sensitive data committed (TruffleHog scan)
- [ ] Build output verified

## Code Quality

- [ ] Code follows project style guide (`npm run lint`)
- [ ] TypeScript has no errors or warnings
- [ ] Comments added for complex logic
- [ ] Documentation updated if needed

## Database

- [ ] No database schema changes
- [ ] New migration added (if applicable)
- [ ] Migration tested locally
- [ ] RLS policies updated (if applicable)

## Performance

- [ ] No performance regressions expected
- [ ] Optimized database queries (if applicable)
- [ ] Rate limiting impact assessed
- [ ] Memory usage reviewed (if applicable)

## Dependencies

- [ ] No new dependencies added
- [ ] Dependencies updated: (list any)
- [ ] Vulnerability audit passed
- [ ] Package versions locked in package-lock.json

## Environment Variables

<!-- If this PR adds new environment variables, list them -->

- [ ] No new environment variables
- New env vars:
  - `VARIABLE_NAME`: Description (default: value)

## Deployment Notes

<!-- Any special considerations for deployment? -->

- Staging deployment: `develop` branch (auto)
- Production deployment: `main` branch (manual approval required)
- Zero-downtime: Yes / No
- Requires data migration: Yes / No

## Screenshots (if applicable)

<!-- Add screenshots for UI changes -->

## Reviewer Notes

<!-- Any specific areas you'd like reviewers to focus on? -->

## Checklist

- [ ] PR title follows conventional commits (feat:, fix:, docs:, etc.)
- [ ] Branch name follows pattern (feature/xyz, bugfix/xyz)
- [ ] All commits are meaningful and atomic
- [ ] No merge conflicts
- [ ] Self-review completed
- [ ] Ready for review and CI checks

---

**CI/CD Status:** All workflows in `.github/workflows/build.yml` will run automatically.

- Lint & TypeScript (Node 18.x, 20.x)
- Unit Tests (with Redis)
- Build Application
- Security Checks
- Migrations Check
- Staging/Production Deployment (as applicable)

**Blocked by:** If any check fails, this PR will be blocked until resolved.
