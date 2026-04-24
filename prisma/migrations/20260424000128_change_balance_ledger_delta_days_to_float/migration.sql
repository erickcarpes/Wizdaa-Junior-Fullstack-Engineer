/*
  Warnings:

  - You are about to alter the column `deltaDays` on the `BalanceLedgerEntry` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BalanceLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "timeOffRequestId" TEXT,
    "entryType" TEXT NOT NULL,
    "deltaDays" REAL NOT NULL,
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
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
