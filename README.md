# Time-Off Service

NestJS + Prisma + SQLite implementation of the ReadyOn time-off microservice assessment.

## Overview

This service manages the lifecycle of time-off requests while keeping the HCM as the source of truth for balances.

Implemented scope:

- local balance projection per `employeeId + locationId`
- defensive local reservation before final HCM confirmation
- manager approve, reject, and cancel flows
- realtime on-demand HCM balance refresh
- outbound HCM submission with retry and uncertain-state handling
- inbound HCM batch balance sync
- stale snapshot protection
- reconciliation flow that resolves exhausted uncertain submissions into `CONFLICT_REVIEW`
- audit endpoints for ledger history and HCM sync events
- local test-support reset endpoint
- terminal scenario runner for end-to-end manual execution
- mock HCM endpoints for deterministic testing

## Stack

- NestJS
- Prisma ORM
- SQLite
- Jest + Supertest
- class-validator / class-transformer

## Architecture

Feature-first module structure:

- `src/modules/balances`
- `src/modules/time-off-requests`
- `src/modules/hcm-integration`
- `src/modules/mock-hcm`
- `src/modules/reconciliation`
- `src/infrastructure/prisma`

Main design decisions:

- `HCM` is the canonical source of truth
- `BalanceProjection` is a local operational projection
- `reservedDays` is separate from confirmed HCM deduction
- outbound HCM mutations are tracked with `HcmSyncEvent`
- retries do not assume timeout means failure
- stale inbound batch snapshots are ignored

## Main Flows

### Employee / Manager lifecycle

1. refresh or load local balance projection
2. create request
3. reserve balance locally
4. manager approves, rejects, or request is cancelled
5. approved requests are submitted to HCM
6. HCM confirms, rejects, or leaves the request uncertain
7. reconciliation resolves exhausted uncertain requests

### HCM synchronization

- realtime inbound: `POST /balances/:employeeId/refresh`
- realtime outbound: `POST /hcm-sync/process-pending`
- batch inbound: `POST /hcm-sync/batch-balances`
- reconciliation: `POST /reconciliation/:employeeId`

## Current API

Business endpoints:

- `GET /balances/:employeeId?locationId=...`
- `GET /balances/:employeeId/ledger?locationId=...&limit=...`
- `POST /balances/:employeeId/refresh?locationId=...`
- `POST /time-off-requests`
- `GET /time-off-requests/:id`
- `GET /time-off-requests/:id/sync-events`
- `POST /time-off-requests/:id/approve`
- `POST /time-off-requests/:id/reject`
- `POST /time-off-requests/:id/cancel`
- `POST /hcm-sync/process-pending`
- `POST /hcm-sync/batch-balances`
- `POST /reconciliation/:employeeId?locationId=...`

Mock HCM endpoints:

- `POST /mock-hcm/admin/balances`
- `GET /mock-hcm/balances/:employeeId?locationId=...`
- `POST /mock-hcm/admin/submission-failures`

Local test-support endpoint:

- `POST /test-support/reset`

## Local Setup

Install dependencies:

```bash
npm install
```

Generate Prisma client:

```bash
npx prisma generate --schema ./prisma/schema.prisma
```

Run migrations:

```bash
npx prisma migrate dev --schema ./prisma/schema.prisma
```

Start the API:

```bash
npm run start:dev
```

## Test Commands

Type-check:

```bash
npx tsc --noEmit
```

Run e2e suite:

```bash
npm run test:e2e
```

Run e2e coverage:

```bash
npx jest --config ./test/jest-e2e-coverage.json --coverage
```

Run scenario runner:

```bash
npm run scenario:run
```

Run a specific scenario:

```bash
npm run scenario:run -- happy-path
```

## Coverage

Current e2e-driven coverage:

| Metric | Coverage |
| --- | ---: |
| Statements | `90.44%` |
| Branches | `69.64%` |
| Functions | `80.68%` |
| Lines | `89.79%` |

Current suite size:

- `31` end-to-end tests

## Manual Testing

Postman collection:

- [docs/time-off-service.postman_collection.json](./docs/time-off-service.postman_collection.json)

Implementation summary:

- [docs/time-off-service-implementation-report.md](./docs/time-off-service-implementation-report.md)

Scenario runner:

- [scripts/run-scenarios.mjs](./scripts/run-scenarios.mjs)

Important manual flow note:

- creating a request depends on the local `BalanceProjection`
- when starting from a clean database, seed the mock HCM first and then call `POST /balances/:employeeId/refresh`
- if you do not want to execute requests one by one, use `npm run scenario:run`

## Known Gaps

The core domain scope is implemented, but these areas can still be improved:

- richer structured logging
- broader reconciliation variants
- additional operational tooling
