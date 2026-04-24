# Time-Off Service Implementation Report

## Current Scope

This service already covers the core lifecycle of a time-off request with local balance protection and outbound HCM synchronization.

Implemented stack:
- NestJS
- Prisma ORM
- SQLite
- class-validator / class-transformer
- e2e validation with Jest + Supertest

## Implemented Domain Flows

### 1. Balance projection read
- Read current balance by `employeeId + locationId`
- Return:
  - `availableDays`
  - `reservedDays`
  - `displayAvailable`

Endpoint:
- `GET /balances/:employeeId?locationId=...`

### 2. Time-off request creation
- Validates input with DTO decorators and application rules
- Requires an existing local `BalanceProjection`
- Checks local `displayAvailable`
- Reserves balance locally
- Creates ledger entry `REQUEST_RESERVED`
- Starts request in `PENDING_MANAGER_APPROVAL`

Endpoint:
- `POST /time-off-requests`

### 3. Request retrieval
- Fetches a request by id

Endpoint:
- `GET /time-off-requests/:requestId`

### 4. Manager approval
- Allows only `PENDING_MANAGER_APPROVAL -> APPROVED`
- Creates outbound `HcmSyncEvent`

Endpoint:
- `POST /time-off-requests/:requestId/approve`

### 5. Manager rejection
- Allows only `PENDING_MANAGER_APPROVAL -> REJECTED`
- Releases reserved balance
- Creates ledger entry `REQUEST_RELEASED`

Endpoint:
- `POST /time-off-requests/:requestId/reject`

### 6. Cancellation before HCM submission finishes
- Allows cancellation only in:
  - `PENDING_MANAGER_APPROVAL`
  - `APPROVED`
- Releases reserved balance
- Invalidates pending outbound sync events as `IGNORED_STALE`
- Blocks cancellation when already `SUBMITTED_TO_HCM`

Endpoint:
- `POST /time-off-requests/:requestId/cancel`

### 7. Outbound HCM processing
- Processes pending outbound time-off submissions
- First marks request as `SUBMITTED_TO_HCM`
- Calls mock HCM outside DB transaction
- On HCM success:
  - request becomes `CONFIRMED_BY_HCM`
  - `hcmSubmissionStatus = CONFIRMED`
  - balance projection is updated from HCM response
  - reserved balance is released
  - ledger entry `REQUEST_CONFIRMED`
- On HCM business rejection:
  - request becomes `FAILED_HCM_VALIDATION`
  - `hcmSubmissionStatus = REJECTED`
  - reserved balance is released
  - ledger entry `REQUEST_RELEASED`

Endpoint:
- `POST /hcm-sync/process-pending`

### 8. Retry for transient HCM failures
- `HcmSyncEvent` now acts as audit log + lightweight retry queue
- Supports:
  - `attempts`
  - `nextAttemptAt`
  - `lastError`
- Processor retries events in `PENDING` or `UNCERTAIN` when due
- Transport failure keeps request in `SUBMITTED_TO_HCM`
- Event becomes `UNCERTAIN` and is retried later

## Mock HCM Support

Implemented test/admin endpoints:
- `POST /mock-hcm/admin/balances`
- `GET /mock-hcm/balances/:employeeId?locationId=...`
- `POST /mock-hcm/admin/submission-failures`

What they support:
- seed remote HCM balances
- inspect remote HCM balances
- force transient submission failure for retry testing

## Concurrency and Integrity Protections

Implemented protections:
- optimistic concurrency on local balance reservation via `version`
- explicit request state transitions in domain entity
- DB constraints in SQLite migration:
  - non-negative balances
  - positive `daysRequested`
  - `endDate >= startDate`
  - non-zero ledger delta
  - non-negative retry attempts

## Implemented State Machine

Covered states:
- `PENDING_MANAGER_APPROVAL`
- `APPROVED`
- `REJECTED`
- `SUBMITTED_TO_HCM`
- `CONFIRMED_BY_HCM`
- `FAILED_HCM_VALIDATION`
- `CANCELLED`

Covered transitions:
- `PENDING_MANAGER_APPROVAL -> APPROVED`
- `PENDING_MANAGER_APPROVAL -> REJECTED`
- `PENDING_MANAGER_APPROVAL -> CANCELLED`
- `APPROVED -> CANCELLED`
- `APPROVED -> SUBMITTED_TO_HCM`
- `SUBMITTED_TO_HCM -> CONFIRMED_BY_HCM`
- `SUBMITTED_TO_HCM -> FAILED_HCM_VALIDATION`

Blocked transitions already enforced:
- approve outside `PENDING_MANAGER_APPROVAL`
- reject outside `PENDING_MANAGER_APPROVAL`
- cancel after submission to HCM

## HTTP Validation

DTO validation is active globally with:
- `whitelist: true`
- `forbidNonWhitelisted: true`
- `transform: true`

This already rejects:
- missing required fields
- invalid ISO dates
- zero or negative requested days
- unexpected properties

## Test Coverage Implemented

Current e2e suite covers:
- balance read
- create request with local reservation
- DTO validation failure
- approve valid request
- reject valid request
- cancel valid request
- successful HCM confirmation
- HCM business rejection due to insufficient balance
- transient HCM failure with retry
- invalid approve state
- invalid cancel state
- insufficient local balance

Current status:
- `12` e2e tests passing

## Important Current Limitation

There is still no public HTTP endpoint that creates or refreshes the local `BalanceProjection` from HCM.

Practical impact:
- a fully clean Postman run cannot start only from HTTP unless the local balance projection already exists in SQLite
- for now, Postman flows that create time-off requests assume the corresponding `BalanceProjection` row was already seeded

## Recommended Next Steps

Recommended next implementation block:
1. realtime balance refresh from HCM into local `BalanceProjection`
2. batch balance sync from HCM
3. reconciliation rules for stale/conflicting projections
4. scheduled processor/cron for `HcmSyncEvent` retries

