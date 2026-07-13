-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "requestedAction" TEXT NOT NULL,
    "requestedTargetState" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "requestedByRole" TEXT NOT NULL,
    "requestReason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "activeTransactionId" TEXT,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedByRole" TEXT,
    "reviewReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    CONSTRAINT "ApprovalRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_activeTransactionId_key" ON "ApprovalRequest"("activeTransactionId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_transactionId_status_idx" ON "ApprovalRequest"("transactionId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status", "createdAt");
