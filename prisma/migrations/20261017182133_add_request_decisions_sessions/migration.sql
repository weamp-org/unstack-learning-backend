-- CreateEnum
CREATE TYPE "HelpRequestStatus" AS ENUM ('OPEN', 'ACCEPTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "HelpDecision" AS ENUM ('ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "HelpSessionSource" AS ENUM ('MANUAL', 'GOOGLE');

-- AlterTable
ALTER TABLE "HelpRequest" ADD COLUMN     "status" "HelpRequestStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "teacherId" TEXT;

-- CreateTable
CREATE TABLE "HelpRequestDecision" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "decision" "HelpDecision" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpRequestDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpSession" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "sessionUrl" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "source" "HelpSessionSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HelpRequestDecision_teacherId_idx" ON "HelpRequestDecision"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "HelpRequestDecision_requestId_teacherId_key" ON "HelpRequestDecision"("requestId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "HelpSession_requestId_key" ON "HelpSession"("requestId");

-- CreateIndex
CREATE INDEX "HelpRequest_status_idx" ON "HelpRequest"("status");

-- AddForeignKey
ALTER TABLE "HelpRequest" ADD CONSTRAINT "HelpRequest_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpRequestDecision" ADD CONSTRAINT "HelpRequestDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "HelpRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpRequestDecision" ADD CONSTRAINT "HelpRequestDecision_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpSession" ADD CONSTRAINT "HelpSession_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "HelpRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
