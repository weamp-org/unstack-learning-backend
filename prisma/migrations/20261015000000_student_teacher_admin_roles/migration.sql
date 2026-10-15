-- Replace UserRole values USER/ADMIN with STUDENT/TEACHER/ADMIN.
-- Existing USER rows become STUDENT; ADMIN rows are preserved.
-- A new enum is created and swapped in because PostgreSQL cannot drop an
-- enum value inside the transaction Prisma migrations run in.

-- CreateEnum
CREATE TYPE "UserRole_new" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');

-- AlterTable: migrate data, mapping legacy USER to STUDENT
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING (
  CASE "role"::text
    WHEN 'USER' THEN 'STUDENT'::"UserRole_new"
    WHEN 'ADMIN' THEN 'ADMIN'::"UserRole_new"
    ELSE 'STUDENT'::"UserRole_new"
  END
);

-- Swap the new enum into place
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";

-- Restore the column default (new STUDENT default)
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'STUDENT';
