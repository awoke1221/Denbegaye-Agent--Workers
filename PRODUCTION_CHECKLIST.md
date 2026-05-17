# Production Readiness Checklist

This document captures the concrete production readiness tasks for the Denbegnaye frontend and backend projects.

---

## 1) Overall Readiness

- [ ] Confirm both frontend and backend repo states are clean and not containing generated artifacts in Git
  - `.next/`
  - `node_modules/`
  - `.env.local` or secret files
- [ ] Standardize on a single package manager for each repo
  - frontend: either `npm` or `pnpm` (remove unused lockfile)
  - backend: confirm `npm` usage and no conflicting lockfiles
- [ ] Confirm repository documentation matches actual architecture and deployment process

---

## 2) Frontend Readiness Checklist

### Build and Validation

- [ ] Install dependencies successfully
- [ ] Run `npm run build` without errors
- [ ] Run `npm run type-check` successfully
- [ ] Run `npm run lint` successfully
- [ ] Run `npm test` successfully
- [ ] Run `npm run format:check` successfully

### Auth and Backend Integration

- [ ] Confirm Supabase auth flows work: login, signup, OAuth, logout
- [ ] Confirm `AuthContext` properly initializes auth session and handles state changes
- [ ] Confirm `app/api/agent-run/route.ts` proxy works with production backend URL
- [ ] Confirm `NEXT_PUBLIC_BACKEND_URL` points to the live backend service
- [ ] Confirm frontend does not break if the backend is unreachable and shows a graceful error

### UI / Feature Flow

- [ ] Confirm landing page renders correctly
- [ ] Confirm agent builder loads and `ReactFlow` editor initializes
- [ ] Confirm nodes and edges can be created, edited, and connected
- [ ] Confirm template browsing and template saving flows operate correctly
- [ ] Confirm execution controls and log panel show expected status updates
- [ ] Confirm sidebar, settings, dashboard, and vault panels work

### Security and Configuration

- [ ] Verify no production secrets are committed in repo
- [ ] Confirm `.env.local.example` only contains placeholders
- [ ] Ensure frontend production build uses secure URLs and no `localhost` references
- [ ] Confirm authentication tokens are forwarded correctly to backend proxy

### Deployment

- [ ] Confirm `next.config.mjs` is configured for production
- [ ] Confirm `package.json` scripts are correct
- [ ] Confirm build output is deployable to the chosen hosting platform
- [ ] Add or verify deployment guide and environment variable list in docs

---

## 3) Backend Readiness Checklist

### Build and Validation

- [ ] Install backend dependencies successfully
- [ ] Run `npm run build` successfully
- [ ] Run `npm test` successfully
- [ ] Confirm backend starts with `npm run dev` or `npm start`
- [ ] Confirm no runtime TypeScript issues in built output

### Environment and Secrets

- [ ] Confirm `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `REDIS_URL` are set in production environments
- [ ] Confirm `ENCRYPTION_KEY` is set to a secure value and not the default placeholder
- [ ] Confirm service role/key usage is correct for Supabase operations
- [ ] Remove any committed `.env.local` or secrets from Git

### Queue and Execution

- [ ] Confirm Redis connectivity and queue availability
- [ ] Confirm job queue can enqueue and process jobs successfully
- [ ] Confirm `job_queue` and `agent_executions` schema exist and match backend expectations
- [ ] Confirm queue retry/backoff behavior works and dead-letter jobs are recorded
- [ ] Confirm queue metrics and admin dashboard can read queue counts

### Workflow Execution

- [ ] Confirm `agentRunHandler` validates auth and workflow payloads correctly
- [ ] Confirm `validateAgentGraph` catches invalid workflows and returns clear errors
- [ ] Confirm execution records transition through statuses: queued → running → completed/failed
- [ ] Confirm fallback execution path works if LangGraph execution fails
- [ ] Confirm node-level handlers execute AI, HTTP, email, and data operations correctly
- [ ] Confirm compensation and retry logic behave as expected under failures

### Security and Monitoring

- [ ] Confirm `helmet` and `cors` are enabled
- [ ] Confirm `/health` and `/health/advanced` endpoints are available
- [ ] Confirm Socket.IO event delivery is working for execution updates
- [ ] Confirm admin routes require admin profile role before access
- [ ] Confirm dynamic evaluation points are safe or mitigated

### Deployment

- [ ] Confirm backend service can run in production environment with `PORT` and `REDIS_URL`
- [ ] Confirm only required environment variables are exposed
- [ ] Confirm logs are structured and capture errors clearly
- [ ] Confirm backend can recover from Redis disconnects and Supabase errors

---

## 4) Shared Readiness Items

- [ ] Confirm frontend backend integration is verified end-to-end
  - frontend sends workflow execution requests
  - backend receives and enqueues jobs
  - worker processes jobs and updates status
  - frontend receives real-time execution updates
- [ ] Confirm shared environment assumptions are documented
  - frontend `NEXT_PUBLIC_BACKEND_URL`
  - backend `FRONTEND_URL`
  - Redis and Supabase endpoints
- [ ] Confirm CI pipeline includes build, lint, test, and deploy steps
- [ ] Confirm rollback and incident response process is documented for production

---

## 5) Recommended Post-Deployment Checks

- [ ] Run a full end-to-end user scenario in staging
- [ ] Validate OAuth redirect flows in the target domain
- [ ] Confirm production monitoring, error tracking, and dashboard alerts are active
- [ ] Add a small runbook or deployment checklist for the next deploy
