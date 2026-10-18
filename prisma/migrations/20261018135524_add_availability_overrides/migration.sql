-- CreateEnum
CREATE TYPE "AvailabilityOverrideKind" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "TeacherAvailabilityOverride" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Accra',
    "kind" "AvailabilityOverrideKind" NOT NULL,

    CONSTRAINT "TeacherAvailabilityOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherAvailabilityOverride_teacherId_idx" ON "TeacherAvailabilityOverride"("teacherId");

-- AddForeignKey
ALTER TABLE "TeacherAvailabilityOverride" ADD CONSTRAINT "TeacherAvailabilityOverride_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
