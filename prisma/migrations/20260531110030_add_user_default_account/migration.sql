-- AlterTable
ALTER TABLE "User" ADD COLUMN     "defaultAccountId" TEXT;

-- CreateTable
CREATE TABLE "ForexCandle" (
    "symbol" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(18,8) NOT NULL,
    "high" DECIMAL(18,8) NOT NULL,
    "low" DECIMAL(18,8) NOT NULL,
    "close" DECIMAL(18,8) NOT NULL,
    "volume" DECIMAL(18,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForexCandle_pkey" PRIMARY KEY ("symbol","interval","time")
);

-- CreateTable
CREATE TABLE "ForexSyncState" (
    "symbol" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "backfillCompleted" BOOLEAN NOT NULL DEFAULT false,
    "oldestCandleTime" TIMESTAMP(3),
    "lastBackfillAt" TIMESTAMP(3),
    "sourceUnavailable" BOOLEAN NOT NULL DEFAULT false,
    "staleSince" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastFailedSyncAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForexSyncState_pkey" PRIMARY KEY ("symbol","interval")
);

-- CreateIndex
CREATE INDEX "ForexCandle_symbol_interval_time_idx" ON "ForexCandle"("symbol", "interval", "time");

-- CreateIndex
CREATE INDEX "ForexSyncState_symbol_interval_idx" ON "ForexSyncState"("symbol", "interval");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultAccountId_fkey" FOREIGN KEY ("defaultAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
