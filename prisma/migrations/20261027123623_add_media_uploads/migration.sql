-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'AUDIO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY');

-- CreateTable
CREATE TABLE "MediaUpload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT,
    "kind" "MediaKind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MediaUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaUpload_objectKey_key" ON "MediaUpload"("objectKey");

-- CreateIndex
CREATE INDEX "MediaUpload_ownerId_status_idx" ON "MediaUpload"("ownerId", "status");

-- CreateIndex
CREATE INDEX "MediaUpload_ownerId_createdAt_idx" ON "MediaUpload"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaUpload_requestId_idx" ON "MediaUpload"("requestId");

-- AddForeignKey
ALTER TABLE "MediaUpload" ADD CONSTRAINT "MediaUpload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaUpload" ADD CONSTRAINT "MediaUpload_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "HelpRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
