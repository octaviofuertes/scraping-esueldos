-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPERADMIN', 'ADMIN');

-- CreateEnum
CREATE TYPE "SalaryScaleStatus" AS ENUM ('DETECTADA_POR_IA', 'PENDIENTE_REVISION', 'APROBADA', 'RECHAZADA', 'ARCHIVADA');

-- CreateEnum
CREATE TYPE "ScaleSourceType" AS ENUM ('FEDERATION', 'SINDICATO', 'MINISTERIO', 'BOLETIN', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MonitorRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "ScaleCandidateStatus" AS ENUM ('DETECTED', 'EXTRACTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'IGNORED');

-- CreateEnum
CREATE TYPE "CctChangeStatus" AS ENUM ('DETECTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousValueJson" JSONB,
    "newValueJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryScaleSource" (
    "id" TEXT NOT NULL,
    "conventionId" TEXT NOT NULL,
    "calculatorKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceType" "ScaleSourceType" NOT NULL DEFAULT 'OTHER',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "checkFrequency" INTEGER NOT NULL DEFAULT 24,
    "monitorSince" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryScaleSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryScaleMonitorRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "MonitorRunStatus" NOT NULL DEFAULT 'RUNNING',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "foundDocumentsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "rawResultJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryScaleMonitorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryScaleCandidate" (
    "id" TEXT NOT NULL,
    "conventionId" TEXT NOT NULL,
    "calculatorKey" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "documentUrl" TEXT,
    "fileName" TEXT,
    "fileHash" TEXT,
    "periodMonth" INTEGER,
    "periodYear" INTEGER,
    "title" TEXT,
    "status" "ScaleCandidateStatus" NOT NULL DEFAULT 'DETECTED',
    "aiConfidence" INTEGER NOT NULL DEFAULT 0,
    "extractedText" TEXT,
    "extractedDataJson" JSONB NOT NULL DEFAULT '{}',
    "diffJson" JSONB NOT NULL DEFAULT '{}',
    "previousVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,

    CONSTRAINT "SalaryScaleCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryScaleVersion" (
    "id" TEXT NOT NULL,
    "conventionId" TEXT NOT NULL,
    "calculatorKey" TEXT NOT NULL,
    "conventionName" TEXT NOT NULL,
    "cct" TEXT,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "status" "SalaryScaleStatus" NOT NULL DEFAULT 'PENDIENTE_REVISION',
    "sourceLabel" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceFileName" TEXT,
    "rawText" TEXT,
    "extractedByIAJson" JSONB NOT NULL DEFAULT '{}',
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryScaleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryScaleItem" (
    "id" TEXT NOT NULL,
    "salaryScaleVersionId" TEXT NOT NULL,
    "categoryKey" TEXT,
    "categoryName" TEXT NOT NULL,
    "baseSalary" DECIMAL(14,2),
    "hourlyWage" DECIMAL(14,2),
    "nonRemunerativeAmount" DECIMAL(14,2),
    "additionalJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryScaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CctNormativeSource" (
    "id" TEXT NOT NULL,
    "conventionId" TEXT NOT NULL,
    "calculatorKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CctNormativeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CctNormativeCandidate" (
    "id" TEXT NOT NULL,
    "conventionId" TEXT NOT NULL,
    "calculatorKey" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "documentUrl" TEXT,
    "fileHash" TEXT,
    "status" "CctChangeStatus" NOT NULL DEFAULT 'DETECTED',
    "extractedText" TEXT,
    "summaryJson" JSONB NOT NULL DEFAULT '{}',
    "diffJson" JSONB NOT NULL DEFAULT '{}',
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "aiConfidence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "CctNormativeCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "SalaryScaleSource_calculatorKey_idx" ON "SalaryScaleSource"("calculatorKey");

-- CreateIndex
CREATE INDEX "SalaryScaleSource_enabled_idx" ON "SalaryScaleSource"("enabled");

-- CreateIndex
CREATE INDEX "SalaryScaleMonitorRun_sourceId_createdAt_idx" ON "SalaryScaleMonitorRun"("sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "SalaryScaleCandidate_calculatorKey_status_idx" ON "SalaryScaleCandidate"("calculatorKey", "status");

-- CreateIndex
CREATE INDEX "SalaryScaleCandidate_fileHash_idx" ON "SalaryScaleCandidate"("fileHash");

-- CreateIndex
CREATE INDEX "SalaryScaleCandidate_status_createdAt_idx" ON "SalaryScaleCandidate"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SalaryScaleVersion_calculatorKey_periodYear_periodMonth_sta_idx" ON "SalaryScaleVersion"("calculatorKey", "periodYear", "periodMonth", "status");

-- CreateIndex
CREATE INDEX "SalaryScaleVersion_status_createdAt_idx" ON "SalaryScaleVersion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SalaryScaleItem_categoryKey_idx" ON "SalaryScaleItem"("categoryKey");

-- CreateIndex
CREATE INDEX "CctNormativeSource_calculatorKey_idx" ON "CctNormativeSource"("calculatorKey");

-- CreateIndex
CREATE INDEX "CctNormativeCandidate_calculatorKey_status_idx" ON "CctNormativeCandidate"("calculatorKey", "status");

-- CreateIndex
CREATE INDEX "CctNormativeCandidate_status_createdAt_idx" ON "CctNormativeCandidate"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryScaleMonitorRun" ADD CONSTRAINT "SalaryScaleMonitorRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SalaryScaleSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryScaleCandidate" ADD CONSTRAINT "SalaryScaleCandidate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SalaryScaleSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryScaleCandidate" ADD CONSTRAINT "SalaryScaleCandidate_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryScaleItem" ADD CONSTRAINT "SalaryScaleItem_salaryScaleVersionId_fkey" FOREIGN KEY ("salaryScaleVersionId") REFERENCES "SalaryScaleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctNormativeCandidate" ADD CONSTRAINT "CctNormativeCandidate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CctNormativeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctNormativeCandidate" ADD CONSTRAINT "CctNormativeCandidate_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
