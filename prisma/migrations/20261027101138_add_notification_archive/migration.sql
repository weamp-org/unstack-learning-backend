-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_recipientId_archivedAt_idx" ON "Notification"("recipientId", "archivedAt");
