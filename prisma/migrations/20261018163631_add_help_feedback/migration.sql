-- CreateTable
CREATE TABLE "HelpFeedback" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HelpFeedback_requestId_key" ON "HelpFeedback"("requestId");

-- AddForeignKey
ALTER TABLE "HelpFeedback" ADD CONSTRAINT "HelpFeedback_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "HelpRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
