-- CreateTable
CREATE TABLE "BalanceProjection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "availableDays" INTEGER NOT NULL DEFAULT 0,
    "reservedDays" INTEGER NOT NULL DEFAULT 0,
    "syncStatus" TEXT NOT NULL DEFAULT 'STALE',
    "lastHcmVersion" TEXT,
    "lastHcmSnapshotAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TimeOffRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "balanceProjectionId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "daysRequested" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VALIDATION',
    "hcmSubmissionStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
    "requestedBy" TEXT,
    "managerId" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "reason" TEXT,
    "hcmReferenceId" TEXT,
    "rejectionReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeOffRequest_balanceProjectionId_fkey" FOREIGN KEY ("balanceProjectionId") REFERENCES "BalanceProjection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BalanceLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "balanceProjectionId" TEXT NOT NULL,
    "timeOffRequestId" TEXT,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "deltaDays" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BalanceLedgerEntry_balanceProjectionId_fkey" FOREIGN KEY ("balanceProjectionId") REFERENCES "BalanceProjection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BalanceLedgerEntry_timeOffRequestId_fkey" FOREIGN KEY ("timeOffRequestId") REFERENCES "TimeOffRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HcmSyncEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "balanceProjectionId" TEXT,
    "timeOffRequestId" TEXT,
    "direction" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "error" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HcmSyncEvent_balanceProjectionId_fkey" FOREIGN KEY ("balanceProjectionId") REFERENCES "BalanceProjection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HcmSyncEvent_timeOffRequestId_fkey" FOREIGN KEY ("timeOffRequestId") REFERENCES "TimeOffRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PendingSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timeOffRequestId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pendingUntil" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PendingSync_timeOffRequestId_fkey" FOREIGN KEY ("timeOffRequestId") REFERENCES "TimeOffRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BalanceProjection_employeeId_locationId_idx" ON "BalanceProjection"("employeeId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceProjection_employeeId_locationId_key" ON "BalanceProjection"("employeeId", "locationId");

-- CreateIndex
CREATE INDEX "TimeOffRequest_balanceProjectionId_idx" ON "TimeOffRequest"("balanceProjectionId");

-- CreateIndex
CREATE INDEX "TimeOffRequest_employeeId_locationId_idx" ON "TimeOffRequest"("employeeId", "locationId");

-- CreateIndex
CREATE INDEX "TimeOffRequest_status_idx" ON "TimeOffRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceLedgerEntry_idempotencyKey_key" ON "BalanceLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BalanceLedgerEntry_balanceProjectionId_idx" ON "BalanceLedgerEntry"("balanceProjectionId");

-- CreateIndex
CREATE INDEX "BalanceLedgerEntry_timeOffRequestId_idx" ON "BalanceLedgerEntry"("timeOffRequestId");

-- CreateIndex
CREATE INDEX "BalanceLedgerEntry_employeeId_locationId_idx" ON "BalanceLedgerEntry"("employeeId", "locationId");

-- CreateIndex
CREATE INDEX "BalanceLedgerEntry_entryType_idx" ON "BalanceLedgerEntry"("entryType");

-- CreateIndex
CREATE INDEX "HcmSyncEvent_balanceProjectionId_idx" ON "HcmSyncEvent"("balanceProjectionId");

-- CreateIndex
CREATE INDEX "HcmSyncEvent_timeOffRequestId_idx" ON "HcmSyncEvent"("timeOffRequestId");

-- CreateIndex
CREATE INDEX "HcmSyncEvent_correlationId_idx" ON "HcmSyncEvent"("correlationId");

-- CreateIndex
CREATE INDEX "HcmSyncEvent_status_idx" ON "HcmSyncEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HcmSyncEvent_direction_idempotencyKey_key" ON "HcmSyncEvent"("direction", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PendingSync_timeOffRequestId_idx" ON "PendingSync"("timeOffRequestId");

-- CreateIndex
CREATE INDEX "PendingSync_status_pendingUntil_idx" ON "PendingSync"("status", "pendingUntil");
