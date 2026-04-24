/*
  Warnings:

  - You are about to drop the `PendingSync` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `balanceProjectionId` on the `BalanceLedgerEntry` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `BalanceLedgerEntry` table. All the data in the column will be lost.
  - You are about to alter the column `availableDays` on the `BalanceProjection` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.
  - You are about to alter the column `reservedDays` on the `BalanceProjection` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.
  - You are about to drop the column `balanceProjectionId` on the `HcmSyncEvent` table. All the data in the column will be lost.
  - You are about to drop the column `balanceProjectionId` on the `TimeOffRequest` table. All the data in the column will be lost.
  - You are about to alter the column `daysRequested` on the `TimeOffRequest` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.
  - Added the required column `updatedAt` to the `HcmSyncEvent` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "PendingSync_status_pendingUntil_idx";

-- DropIndex
DROP INDEX "PendingSync_timeOffRequestId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PendingSync";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BalanceLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "timeOffRequestId" TEXT,
    "entryType" TEXT NOT NULL,
    "deltaDays" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BalanceLedgerEntry_deltaDays_non_zero_chk" CHECK ("deltaDays" <> 0),
    CONSTRAINT "BalanceLedgerEntry_employeeId_locationId_fkey" FOREIGN KEY ("employeeId", "locationId") REFERENCES "BalanceProjection" ("employeeId", "locationId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BalanceLedgerEntry_timeOffRequestId_fkey" FOREIGN KEY ("timeOffRequestId") REFERENCES "TimeOffRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BalanceLedgerEntry" ("deltaDays", "employeeId", "entryType", "id", "idempotencyKey", "locationId", "metadata", "occurredAt", "source", "timeOffRequestId") SELECT "deltaDays", "employeeId", "entryType", "id", "idempotencyKey", "locationId", "metadata", "occurredAt", "source", "timeOffRequestId" FROM "BalanceLedgerEntry";
DROP TABLE "BalanceLedgerEntry";
ALTER TABLE "new_BalanceLedgerEntry" RENAME TO "BalanceLedgerEntry";
CREATE UNIQUE INDEX "BalanceLedgerEntry_idempotencyKey_key" ON "BalanceLedgerEntry"("idempotencyKey");
CREATE INDEX "BalanceLedgerEntry_employeeId_locationId_idx" ON "BalanceLedgerEntry"("employeeId", "locationId");
CREATE INDEX "BalanceLedgerEntry_timeOffRequestId_idx" ON "BalanceLedgerEntry"("timeOffRequestId");
CREATE INDEX "BalanceLedgerEntry_entryType_idx" ON "BalanceLedgerEntry"("entryType");
CREATE TABLE "new_BalanceProjection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "availableDays" REAL NOT NULL DEFAULT 0,
    "reservedDays" REAL NOT NULL DEFAULT 0,
    "syncStatus" TEXT NOT NULL DEFAULT 'STALE',
    "lastHcmVersion" TEXT,
    "lastHcmSnapshotAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BalanceProjection_availableDays_non_negative_chk" CHECK ("availableDays" >= 0),
    CONSTRAINT "BalanceProjection_reservedDays_non_negative_chk" CHECK ("reservedDays" >= 0),
    CONSTRAINT "BalanceProjection_version_min_one_chk" CHECK ("version" >= 1)
);
INSERT INTO "new_BalanceProjection" ("availableDays", "createdAt", "employeeId", "id", "lastHcmSnapshotAt", "lastHcmVersion", "locationId", "reservedDays", "syncStatus", "updatedAt", "version") SELECT "availableDays", "createdAt", "employeeId", "id", "lastHcmSnapshotAt", "lastHcmVersion", "locationId", "reservedDays", "syncStatus", "updatedAt", "version" FROM "BalanceProjection";
DROP TABLE "BalanceProjection";
ALTER TABLE "new_BalanceProjection" RENAME TO "BalanceProjection";
CREATE UNIQUE INDEX "BalanceProjection_employeeId_locationId_key" ON "BalanceProjection"("employeeId", "locationId");
CREATE TABLE "new_HcmSyncEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timeOffRequestId" TEXT,
    "direction" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME,
    "lastError" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HcmSyncEvent_attempts_non_negative_chk" CHECK ("attempts" >= 0),
    CONSTRAINT "HcmSyncEvent_timeOffRequestId_fkey" FOREIGN KEY ("timeOffRequestId") REFERENCES "TimeOffRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_HcmSyncEvent" ("correlationId", "createdAt", "direction", "error", "eventType", "id", "idempotencyKey", "payload", "processedAt", "status", "timeOffRequestId", "attempts", "nextAttemptAt", "lastError", "updatedAt") SELECT "correlationId", "createdAt", "direction", "error", "eventType", "id", "idempotencyKey", "payload", "processedAt", "status", "timeOffRequestId", 0, NULL, NULL, COALESCE("processedAt", "createdAt") FROM "HcmSyncEvent";
DROP TABLE "HcmSyncEvent";
ALTER TABLE "new_HcmSyncEvent" RENAME TO "HcmSyncEvent";
CREATE INDEX "HcmSyncEvent_status_nextAttemptAt_idx" ON "HcmSyncEvent"("status", "nextAttemptAt");
CREATE UNIQUE INDEX "HcmSyncEvent_direction_eventType_idempotencyKey_key" ON "HcmSyncEvent"("direction", "eventType", "idempotencyKey");
CREATE TABLE "new_TimeOffRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "daysRequested" REAL NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VALIDATION',
    "managerId" TEXT,
    "requestedBy" TEXT,
    "hcmReferenceId" TEXT,
    "hcmSubmissionStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
    "rejectionReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeOffRequest_daysRequested_positive_chk" CHECK ("daysRequested" > 0),
    CONSTRAINT "TimeOffRequest_date_interval_valid_chk" CHECK ("endDate" >= "startDate"),
    CONSTRAINT "TimeOffRequest_version_min_one_chk" CHECK ("version" >= 1),
    CONSTRAINT "TimeOffRequest_employeeId_locationId_fkey" FOREIGN KEY ("employeeId", "locationId") REFERENCES "BalanceProjection" ("employeeId", "locationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TimeOffRequest" ("createdAt", "daysRequested", "employeeId", "endDate", "hcmReferenceId", "hcmSubmissionStatus", "id", "locationId", "managerId", "reason", "rejectionReason", "requestedBy", "startDate", "status", "updatedAt", "version") SELECT "createdAt", "daysRequested", "employeeId", "endDate", "hcmReferenceId", "hcmSubmissionStatus", "id", "locationId", "managerId", "reason", "rejectionReason", "requestedBy", "startDate", "status", "updatedAt", "version" FROM "TimeOffRequest";
DROP TABLE "TimeOffRequest";
ALTER TABLE "new_TimeOffRequest" RENAME TO "TimeOffRequest";
CREATE INDEX "TimeOffRequest_employeeId_locationId_idx" ON "TimeOffRequest"("employeeId", "locationId");
CREATE INDEX "TimeOffRequest_status_idx" ON "TimeOffRequest"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
