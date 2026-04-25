# Time-Off Microservice TRD

## 1. Objective

Build a backend microservice in NestJS with Prisma ORM and SQLite that:

- manages the lifecycle of time-off requests;
- maintains balance integrity per `employeeId` and `locationId`;
- keeps the HCM as the source of truth;
- gives fast and defensible feedback to employees and managers;
- handles stale data, retries, external balance changes, and partial failures.

This TRD is intentionally aligned to the system that is actually implemented today. It does not describe an idealized future architecture as if it were already delivered.

## 2. Problem Summary

ReadyOn is the primary interface where employees request time off. The HCM owns canonical balance data.

That creates a distributed consistency problem:

- ReadyOn must answer quickly.
- HCM balances can change independently.
- HCM offers realtime APIs and batch delivery.
- HCM often validates insufficient balance or invalid dimensions, but that cannot be trusted as the only protection.
- network failures and retries create uncertain outcomes.

The service therefore uses a local projection plus explicit request states, instead of pretending cross-system writes are instantly and perfectly consistent.

## 3. Scope and Assumptions

- balances are scoped by `employeeId + locationId`;
- one active balance bucket exists per `(employeeId, locationId)`;
- HCM remains the source of truth;
- ReadyOn keeps a local balance projection for speed and defensive validation;
- manager approval is in scope;
- mock HCM endpoints are part of the solution and test suite;
- Prisma + SQLite are used for the assessment;
- SQLite is acceptable for the exercise, though not the preferred production database for high concurrency.

## 4. Goals

- employees can see a near-real-time balance;
- employees get immediate feedback on requests;
- managers approve against trustworthy data;
- local oversubscription is prevented defensively;
- drift between ReadyOn and HCM can be detected and repaired;
- retries and duplicate processing do not silently corrupt state;
- the API surface is testable and auditable.

## 5. Non-Goals

- payroll or accrual policy engines;
- UI implementation;
- enterprise-grade observability stack;
- multi-HCM orchestration;
- every possible reconciliation strategy that a production platform might eventually support.

## 6. Current Delivery Status

The current implementation already includes:

- local balance projection reads;
- local defensive reservation;
- request creation, approval, rejection, and cancellation;
- realtime on-demand refresh from HCM mock;
- outbound HCM submission with retries;
- inbound HCM batch balance sync;
- stale snapshot protection;
- reconciliation for exhausted uncertain requests;
- explicit `CONFLICT_REVIEW`;
- audit endpoints for ledger entries and sync events;
- scenario runner for manual flow execution;
- e2e suite with coverage proof.

## 7. Domain Model

### 7.1 `BalanceProjection`

Local representation of the latest known HCM balance for one `(employeeId, locationId)`.

Important fields:

- `employeeId`
- `locationId`
- `availableDays`
- `reservedDays`
- `syncStatus`
- `lastHcmVersion`
- `lastHcmSnapshotAt`
- `version`

Important behavior:

- `displayAvailable = availableDays - reservedDays`
- `availableDays` comes from HCM snapshots
- `reservedDays` is local operational state for approved-but-not-finalized usage

### 7.2 `TimeOffRequest`

Represents one request created in ReadyOn.

Important fields:

- `employeeId`
- `locationId`
- `daysRequested`
- `startDate`
- `endDate`
- `reason`
- `requestedBy`
- `managerId`
- `status`
- `hcmSubmissionStatus`
- `hcmReferenceId`
- `rejectionReason`
- `version`

Implemented statuses:

- `PENDING_MANAGER_APPROVAL`
- `APPROVED`
- `REJECTED`
- `SUBMITTED_TO_HCM`
- `CONFIRMED_BY_HCM`
- `FAILED_HCM_VALIDATION`
- `CANCELLED`
- `CONFLICT_REVIEW`

### 7.3 `BalanceLedgerEntry`

Immutable audit trail for balance-affecting operations.

Implemented entry types:

- `REQUEST_RESERVED`
- `REQUEST_RELEASED`
- `REQUEST_CONFIRMED`
- `HCM_SNAPSHOT_REPLACED`

Sources:

- `READYON`
- `HCM_REALTIME`
- `HCM_BATCH`
- `SYSTEM_RECONCILIATION`

### 7.4 `HcmSyncEvent`

Tracks inbound and outbound synchronization attempts.

Important fields:

- `direction`
- `eventType`
- `status`
- `correlationId`
- `idempotencyKey`
- `payload`
- `attempts`
- `nextAttemptAt`
- `lastError`
- `processedAt`

Implemented event types:

- `TIME_OFF_SUBMISSION`
- `BATCH_BALANCE_SYNC`

Implemented statuses:

- `PENDING`
- `PROCESSED`
- `FAILED`
- `IGNORED_STALE`
- `UNCERTAIN`

## 8. Why a Local Projection Exists

HCM is canonical, but ReadyOn still needs local state because:

- the user experience cannot depend on slow or failing remote reads for every interaction;
- the service needs defensive validation before calling HCM;
- retries and partial failures need a local operational model;
- reconciliation needs a local object to repair;
- tests need deterministic state transitions.

This is a projection, not a replacement for the source of truth.

## 9. Critical Invariants

1. Final official balance comes from HCM.
2. A request is only definitively confirmed when the HCM confirmation path succeeds.
3. Older HCM snapshots must not overwrite newer local HCM-derived state.
4. Outbound retries must not silently duplicate business effects.
5. Balance reservation and request creation must stay transactionally consistent locally.
6. Request state transitions must remain auditable.
7. Exhausted uncertainty must become explicit, not hidden.

## 10. Main Design Decisions

### 10.1 Local Reservation Is Separate From Confirmed Deduction

The service stores:

- `availableDays`: latest balance from HCM
- `reservedDays`: approved local usage not yet finalized in HCM

This enables immediate conservative feedback:

- HCM says `10`
- one approved request reserves `2`
- UI shows `8`

### 10.2 HCM Validation Is Helpful but Not Sufficient

The service still does local defensive validation because:

- HCM rejection is not guaranteed to cover every invalid case;
- local stale/missing projection must be treated explicitly;
- the assessment explicitly asks for a defensive system.

### 10.3 Timeout Does Not Mean Failure

If the outbound submission times out, the service:

- records the sync attempt;
- marks it `UNCERTAIN`;
- schedules retries using `attempts` and `nextAttemptAt`;
- later reconciles unresolved cases.

### 10.4 Stale Batch Snapshots Are Ignored

Inbound batch updates compare `snapshotAt` with `lastHcmSnapshotAt`.

If the incoming snapshot is older than what was already applied, it is ignored instead of overwriting newer state.

### 10.5 Unresolved Uncertainty Becomes `CONFLICT_REVIEW`

If retries are exhausted and the system still cannot determine the outcome, reconciliation moves the request into `CONFLICT_REVIEW` and marks the balance projection as `CONFLICT`.

## 11. Implemented Architecture

### 11.1 `balances`

Responsibilities:

- read balance projection;
- refresh local balance from HCM mock on demand;
- expose balance ledger audit entries;
- upsert HCM snapshots into the local projection.

### 11.2 `time-off-requests`

Responsibilities:

- create requests;
- validate request input;
- enforce state transitions;
- approve, reject, and cancel requests;
- expose sync-event audit history for a request.

### 11.3 `hcm-integration`

Responsibilities:

- process outbound HCM submissions;
- persist outbound sync attempts;
- retry transient failures;
- ingest inbound batch balance snapshots;
- reject stale batch updates.

### 11.4 `mock-hcm`

Responsibilities:

- hold mock HCM balances in memory;
- simulate business rejection for insufficient balance;
- simulate transient submission failure;
- retain accepted submissions for reconciliation support.

### 11.5 `reconciliation`

Responsibilities:

- refresh local view against HCM mock;
- resolve uncertain requests where possible;
- move unresolved exhausted uncertainty into `CONFLICT_REVIEW`.

### 11.6 `test-support`

Responsibilities:

- reset local database and mock HCM state for manual scenario execution.

## 12. Implemented API Surface

### 12.1 Business Endpoints

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

### 12.2 Mock/Test Endpoints

- `POST /mock-hcm/admin/balances`
- `GET /mock-hcm/balances/:employeeId?locationId=...`
- `POST /mock-hcm/admin/submission-failures`
- `POST /test-support/reset`

## 13. Implemented Request Lifecycle

1. HCM balance can be seeded or updated in the mock HCM.
2. Local projection can be refreshed on demand.
3. Employee creates a request.
4. Service checks local `displayAvailable`.
5. If safe, it creates the request in `PENDING_MANAGER_APPROVAL` and increments `reservedDays`.
6. Manager can:
   - approve
   - reject
   - or the request can be cancelled while still locally safe to do so
7. Approval creates an outbound `HcmSyncEvent`.
8. Outbound processing can:
   - confirm the request in HCM
   - fail by HCM business validation
   - or become uncertain due to transport failure
9. Reconciliation can later resolve exhausted uncertainty or move it to `CONFLICT_REVIEW`.

## 14. Implemented Concurrency Strategy

SQLite does not provide fine-grained row-level locking like PostgreSQL.

The implementation therefore uses optimistic concurrency where it matters:

- `BalanceProjection.version`
- `TimeOffRequest.version`
- conditional updates for reservation-sensitive paths

This keeps write transactions short and avoids pretending SQLite behaves like a higher-end production database.

## 15. Implemented Sync and Reconciliation Strategy

### 15.1 Realtime Inbound

`POST /balances/:employeeId/refresh`

Behavior:

- reads the current HCM mock balance;
- upserts the local `BalanceProjection`;
- marks the projection `IN_SYNC`.

### 15.2 Realtime Outbound

`POST /hcm-sync/process-pending`

Behavior:

- finds pending or uncertain submission events that are due;
- marks request `SUBMITTED_TO_HCM` when first sent;
- calls HCM mock;
- on success:
  - request becomes `CONFIRMED_BY_HCM`
  - reservation is released
  - projection is updated
- on business rejection:
  - request becomes `FAILED_HCM_VALIDATION`
  - reservation is released
- on transport failure:
  - event becomes `UNCERTAIN`
  - retry metadata is updated

### 15.3 Batch Inbound

`POST /hcm-sync/batch-balances`

Behavior:

- deduplicates by batch idempotency key;
- upserts projections in bulk;
- creates inbound sync event;
- ignores stale snapshots;
- writes `HCM_SNAPSHOT_REPLACED` ledger entries when balances materially change.

### 15.4 Reconciliation

`POST /reconciliation/:employeeId`

Current implemented behavior:

- refreshes local balance from HCM mock;
- checks submitted requests still in uncertain territory;
- confirms them if the HCM mock already knows the accepted submission;
- otherwise, if uncertainty is exhausted, moves them to `CONFLICT_REVIEW`.

This is intentionally a focused reconciliation path, not a fully generic enterprise reconciliation engine.

## 16. Observability and Auditability

The current implementation includes:

- ledger audit endpoint;
- sync-event audit endpoint;
- structured Nest `Logger` usage in:
  - batch ingestion
  - outbound submission processing
  - HCM confirmation/rejection
  - reconciliation

This is enough for assessment-level troubleshooting, though not a complete observability platform.

## 17. Test Strategy and Coverage

The main test strategy is end-to-end scenario coverage over the real Nest application, Prisma persistence, and mock HCM integration boundary.

Covered scenarios include:

- balance read
- on-demand refresh
- batch ingestion
- stale snapshot ignore
- request creation with reservation
- manager rejection
- cancellation before effective submission
- HCM confirmation
- HCM business rejection
- transient retry
- reconciliation to `CONFLICT_REVIEW`
- DTO validation failures
- audit endpoints for ledger and sync events

Coverage proof:

- command: `npx jest --config ./test/jest-e2e-coverage.json --coverage`

| Metric | Coverage |
| --- | ---: |
| Statements | `90.44%` |
| Branches | `69.64%` |
| Functions | `80.68%` |
| Lines | `89.79%` |

- Current e2e suite: `31` tests

## 18. Known Limitations

- on-demand refresh exists, but refresh policy is not yet globally automatic across every business flow;
- reconciliation focuses on the most valuable implemented uncertainty path, not every possible enterprise drift scenario;
- observability is useful but still lightweight;
- no dedicated metrics, tracing, or dashboarding layer exists;
- no dedicated read endpoints yet exist for full ledger browsing across the entire system, only scoped audit reads;
- the mock HCM is intentionally simple and does not model every nuance of a real Workday/SAP integration.

## 19. Future Evolutions

- auto-refresh when the local projection is stale or absent during critical request flows;
- scheduled reconciliation and sync jobs;
- richer reconciliation policies for more drift variants;
- broader audit and reporting endpoints;
- metrics, tracing, and operational dashboards;
- production migration from SQLite to PostgreSQL or equivalent.

## 20. Why This Is a Strong Assessment Submission

The implemented system covers the core scope expected by the assignment:

- lifecycle management;
- balance integrity;
- realtime and batch synchronization;
- defensive validation;
- auditability;
- rigorous test coverage;
- explicit handling of uncertain distributed outcomes.

It does not claim to be a finished enterprise product. It is a strong, coherent, and defensible assessment implementation with clear boundaries and clear next steps.

Request example:

```json
{
  "requestId": "tor-001",
  "employeeId": "emp-123",
  "locationId": "loc-1",
  "daysRequested": 2,
  "startDate": "2026-05-12",
  "endDate": "2026-05-13",
  "idempotencyKey": "submit-tor-001-v1"
}
```

Possible HCM outcomes:

- success with external reference;
- rejection for insufficient balance;
- rejection for invalid dimensions;
- timeout/unknown outcome;
- acceptance despite local mismatch.

### 14.3 Batch Snapshot Endpoint

HCM pushes a corpus of balances to ReadyOn:

`POST /balances/sync/batch`

Payload example:

```json
{
  "batchId": "batch-2026-04-23-001",
  "generatedAt": "2026-04-23T23:00:00.000Z",
  "balances": [
    {
      "employeeId": "emp-123",
      "locationId": "loc-1",
      "availableDays": 12,
      "version": "v43",
      "snapshotAt": "2026-04-23T22:59:58.000Z"
    }
  ]
}
```

## 15. ReadyOn Service API Proposal

REST is the most defensible choice here because:

- the domain is operational and command-heavy;
- endpoints map cleanly to request lifecycle actions;
- testability and assessor readability are better;
- GraphQL adds little value for the core integration problem.

### 15.1 Employee/Manager APIs

`GET /balances/:employeeId?locationId=loc-1`

Returns:

- authoritative metadata of last HCM sync;
- available, reserved, displayAvailable;
- sync status.

`POST /time-off-requests`

Creates a request.

Request example:

```json
{
  "employeeId": "emp-123",
  "locationId": "loc-1",
  "daysRequested": 2,
  "startDate": "2026-05-12",
  "endDate": "2026-05-13",
  "reason": "Vacation"
}
```

`GET /time-off-requests/:id`

Returns request details, current state, and any HCM sync metadata.

`POST /time-off-requests/:id/approve`

Manager approval action.

`POST /time-off-requests/:id/reject`

Manager rejection action.

`POST /time-off-requests/:id/cancel`

Cancels request only if it is in a cancellable state.

Important rule:

- requests in `SUBMITTED_TO_HCM` or `CONFLICT_REVIEW` are not cancellable by user or manager;
- the system must first resolve the final external outcome through reconciliation;
- only after the request leaves the in-flight or uncertain states may a cancellation or reversal flow be considered.

### 15.2 Integration/Internal APIs

`POST /balances/sync/realtime-refresh`

Forces a balance refresh from HCM for one employee/location.

`POST /balances/sync/batch`

Receives HCM batch corpus.

`POST /reconciliation/run`

Runs repair for one employee/location or a full batch.

## 16. Request State Machine

Recommended transitions:

- `PENDING_VALIDATION -> PENDING_MANAGER_APPROVAL`
- `PENDING_VALIDATION -> FAILED_HCM_VALIDATION`
- `PENDING_MANAGER_APPROVAL -> APPROVED`
- `PENDING_MANAGER_APPROVAL -> REJECTED`
- `APPROVED -> SUBMITTED_TO_HCM`
- `SUBMITTED_TO_HCM -> CONFIRMED_BY_HCM`
- `SUBMITTED_TO_HCM -> FAILED_HCM_VALIDATION`
- `SUBMITTED_TO_HCM -> CONFLICT_REVIEW`
- `APPROVED -> CANCELLED`
- `CONFLICT_REVIEW -> CONFIRMED_BY_HCM`
- `CONFLICT_REVIEW -> FAILED_HCM_VALIDATION`
- `CONFIRMED_BY_HCM -> CANCELLED` only if downstream cancellation flow is supported

Important:

- do not jump directly from request creation to confirmed unless HCM has definitively accepted it;
- do not silently delete failed requests;
- keep rejection and failure states explicit.
- do not allow user or manager cancellation while the request is in `SUBMITTED_TO_HCM` or `CONFLICT_REVIEW`.

## 17. Failure Handling

### 17.1 HCM Rejection

Actions:

- mark request as `FAILED_HCM_VALIDATION`;
- release local reservation;
- capture rejection reason;
- refresh projection from HCM immediately.

### 17.2 Timeout / Unknown Outcome

Actions:

- keep outbound sync record with `PENDING_CONFIRMATION`;
- retry safely using idempotency key;
- if still unresolved, mark request `CONFLICT_REVIEW`;
- place the request into a delayed reconciliation queue or `PendingSync` table;
- run reconciliation only after a stabilization delay.

Reason:

- the HCM may still be processing the request after the client-side timeout;
- reconciling too early can restore local balance before the HCM finishes the deduction, creating phantom availability.

### 17.3 Out-of-Order Batch

If batch version/timestamp is older than current projection:

- ignore it, or
- store it as processed but not applied.

If ordering cannot be guaranteed:

- accept snapshot into staging;
- compare against current reservation math;
- mark `CONFLICT` when ambiguity exists.

## 18. Reconciliation Strategy

Reconciliation is not optional. It is one of the most important differentiators in this assessment.

Triggers:

- scheduled job;
- uncertain HCM response;
- batch ingestion;
- manual admin trigger;
- detected version mismatch.

Actions:

1. Fetch latest HCM balance.
2. Load local projection and active requests.
3. Recompute expected local display state.
4. If snapshot differs only because of new HCM accrual, update projection.
5. If a submitted request is missing confirmation but HCM balance reflects the deduction, mark it as confirmed.
6. If local reservation exists but HCM definitively rejects or lacks the deduction, release reservation and fail the request.
7. Record ledger entries for every adjustment.

Important rule for timeout-originated reconciliation:

- the first reconciliation attempt should happen only after a minimum wait window;
- this delay reduces the risk of observing HCM in a transient pre-commit state.

## 19. Security and Validation

Minimum validation:

- `employeeId` required;
- `locationId` required;
- `daysRequested > 0`;
- date interval valid;
- request cannot exceed maximum allowed numeric precision;
- duplicate approval/rejection commands rejected;
- invalid state transitions rejected.

For assessment scope, authentication can be mocked or simplified, but role intent should still exist:

- employee actions;
- manager actions;
- integration/internal endpoints.

## 20. Observability

At minimum, include:

- structured logs with `requestId`, `employeeId`, `locationId`, `timeOffRequestId`, `correlationId`;
- outbound HCM latency;
- reconciliation outcomes;
- count of conflicts;
- count of stale projections;
- batch rows processed / ignored / conflicted.

This matters because distributed balance bugs are usually diagnosed through traceability, not just code inspection.

## 21. Alternatives Considered

### Alternative A: Query HCM on Every Read and Write

Pros:

- freshest possible data;
- minimal local state complexity.

Cons:

- poor user latency;
- brittle if HCM is unavailable;
- still does not solve uncertain write outcomes cleanly;
- weak audit and reconciliation story.

Decision:

- rejected.

### Alternative B: Treat ReadyOn Local Database as Source of Truth and Sync Back to HCM Later

Pros:

- faster local operations;
- simpler UI semantics.

Cons:

- contradicts problem statement;
- dangerous if HCM changes independently;
- invites long-lived drift and hard conflicts.

Decision:

- rejected.

### Alternative C: Event-Driven Architecture With Message Broker

Pros:

- cleaner scaling and async boundaries;
- stronger decoupling.

Cons:

- heavier than the assessment needs;
- extra infrastructure not requested;
- SQLite + local test suite becomes more complex.

Decision:

- document as future evolution, not initial implementation.

### Alternative D: GraphQL API

Pros:

- flexible querying for UI.

Cons:

- does not materially improve command workflows;
- adds surface area with little gain for the integration problem.

Decision:

- rejected in favor of REST.

## 22. Test Strategy

The test suite is explicitly a major evaluation axis, so it should be designed as the strongest part of the submission.

### 22.1 Test Types

#### Unit Tests

Focus:

- state transition rules;
- balance math;
- validation logic;
- reconciliation decision logic;
- stale event rejection;
- idempotency handling.

#### Integration Tests

Focus:

- NestJS modules with SQLite;
- transaction boundaries;
- repositories and services working together;
- local reservation and release behavior.

#### Contract / API Tests

Focus:

- REST endpoint behavior;
- expected HTTP codes;
- response payload correctness;
- duplicate command handling.

#### End-to-End Tests With Mock HCM

Focus:

- full request lifecycle;
- realtime HCM approval/rejection;
- timeout and retry scenarios;
- batch sync overriding stale local projections;
- independent HCM accrual events.

### 22.2 Mock HCM Requirements

The mock HCM should expose:

- realtime balance read endpoint;
- realtime time-off submit endpoint;
- batch push endpoint or controllable batch fixture source;
- configurable failure modes;
- deterministic toggles for:
  - insufficient balance;
  - invalid dimension;
  - timeout after processing;
  - stale snapshot emission;
  - balance increase from anniversary;
  - duplicate event delivery.

### 22.3 High-Value Test Scenarios

#### Request Creation and Validation

- create request with valid balance;
- reject when `daysRequested <= 0`;
- reject invalid date interval;
- reject missing employee/location;
- reject immediately when local display balance is insufficient.

#### Approval and HCM Sync

- approve request and confirm via HCM;
- approve request and get HCM insufficient-balance rejection;
- approve request and get invalid dimension rejection;
- approve request and receive timeout with later successful reconciliation.

#### Concurrency

- two requests created concurrently against same `(employeeId, locationId)` where only one should reserve successfully;
- concurrent approval and batch refresh;
- duplicate approval command should be idempotent or safely rejected.

#### Batch and Drift

- batch snapshot increases balance due to anniversary accrual;
- batch snapshot decreases balance because another external system consumed days;
- stale batch snapshot should not overwrite newer projection;
- batch arrives while request is pending HCM confirmation.

#### Idempotency

- duplicate HCM callback/event does not duplicate ledger entries;
- retry of outbound HCM submission does not create double deduction;
- duplicate batch ingestion using same batchId is safe.

#### Reconciliation

- uncertain outbound submission resolved as success;
- uncertain outbound submission resolved as rejection;
- local reservation exists but HCM balance changed externally;
- reconciliation updates request state and audit trail correctly.

#### Auditability

- every accepted transition writes ledger/sync records;
- error paths also produce traceable records.

### 22.4 Coverage Expectations

Coverage alone is not quality, but the deliverable asks for proof of coverage.

Suggested target:

- high branch coverage on domain services and state machine logic;
- explicit report artifact from Jest;
- emphasize scenario coverage more than raw percentage.

## 23. Suggested Implementation Order

1. Define entities and request state machine.
2. Implement local balance projection and transactional reservation logic.
3. Implement request APIs.
4. Implement mock HCM with configurable behaviors.
5. Implement realtime HCM integration.
6. Implement batch ingestion.
7. Implement reconciliation.
8. Build E2E scenarios around failure and drift.
9. Produce coverage report and finalize documentation.

## 24. Risks and Mitigations

### Risk: SQLite write contention

Mitigation:

- keep transactions short;
- use optimistic concurrency control with `version` checks instead of assuming row-level locking;
- test concurrency deterministically;
- note that production would move to PostgreSQL.

### Risk: HCM has no reliable version field

Mitigation:

- fall back to snapshot timestamp;
- if even timestamp is unreliable, use reconciliation and explicit conflict states.

### Risk: Hidden business rules not stated in the prompt

Mitigation:

- isolate policy logic in dedicated services;
- document assumptions clearly;
- keep API extensible.

### Risk: Overengineering the assessment

Mitigation:

- keep first implementation bounded to the exact prompt;
- document future extensions instead of building them.

## 26. Open Product & Integration Questions

- Is manager approval mandatory for every request?
- Should balance be deducted at approval time or only after HCM confirmation?
- Does HCM provide an event stream, only polling, or just batch push?
- Are cancellations in scope?
- Can the same employee have multiple leave categories, or only one bucket per location?
- Does HCM guarantee version ordering on balance snapshots?

## 27. Positioning for the Assessment

The strongest submission is not the one with the most code. It is the one that demonstrates:

- correct understanding of distributed consistency tradeoffs;
- explicit invariants;
- failure-aware lifecycle design;
- solid test strategy with realistic mocks;
- clean, bounded implementation choices.

This problem is fundamentally about **consistency under partial failure**, not CRUD.
