-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('UPLOADED', 'MANUAL', 'GENERATED');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('VERIFIED', 'GENERATED', 'USER_EDITED');

-- CreateEnum
CREATE TYPE "ResumeState" AS ENUM ('UPLOADED', 'PARSED', 'NORMALIZED', 'VERIFIED', 'JD_ANALYZED', 'STRATEGY_READY', 'GENERATING', 'QA_REVIEWED', 'USER_EDITING', 'EXPORTED', 'TRACKED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'INTERVIEWING', 'OFFER', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('TECHNICAL', 'OPERATIONS', 'BUSINESS', 'DATA', 'FINANCE', 'ACADEMIC', 'FEDERAL', 'CREATIVE');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "location" TEXT,
    "linkedinUrl" TEXT,
    "hashedPassword" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkHistory" (
    "id" TEXT NOT NULL,
    "careerMemoryId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "current" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "employmentType" TEXT,
    "sourceType" "SourceType" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bullet" (
    "id" TEXT NOT NULL,
    "workHistoryId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "metrics" TEXT[],
    "keywords" TEXT[],
    "locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Bullet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Education" (
    "id" TEXT NOT NULL,
    "careerMemoryId" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "graduationDate" TIMESTAMP(3),
    "expected" BOOLEAN NOT NULL DEFAULT false,
    "gpa" TEXT,
    "sourceType" "SourceType" NOT NULL,

    CONSTRAINT "Education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "careerMemoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qualifier" TEXT,
    "category" TEXT,
    "sourceType" "SourceType" NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL,
    "careerMemoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "year" INTEGER,
    "sourceType" "SourceType" NOT NULL,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "careerMemoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "technologies" TEXT[],
    "sourceType" "SourceType" NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "careerMemoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "targetRole" TEXT NOT NULL,
    "targetCompany" TEXT,
    "jdText" TEXT,
    "jdKeywords" TEXT[],
    "roleType" "RoleType",
    "tone" TEXT,
    "structure" TEXT,
    "state" "ResumeState" NOT NULL DEFAULT 'UPLOADED',
    "latexSource" TEXT,
    "pdfUrl" TEXT,
    "atsScore" INTEGER,
    "keywordScore" INTEGER,
    "visualScore" INTEGER,
    "pageCount" INTEGER,
    "jdAnalysisJson" JSONB,
    "strategyJson" JSONB,
    "summaryText" TEXT,
    "pipelineStartedAt" TIMESTAMP(3),
    "pipelineFinishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "exportedAt" TIMESTAMP(3),

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeSection" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT,

    CONSTRAINT "ResumeSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeBullet" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "bulletId" TEXT NOT NULL,

    CONSTRAINT "ResumeBullet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "appliedAt" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "notes" TEXT,
    "interviewLog" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredTone" TEXT NOT NULL DEFAULT 'professional',
    "rewriteAggressiveness" INTEGER NOT NULL DEFAULT 50,
    "bulletStyle" TEXT NOT NULL DEFAULT 'impact',
    "lengthPreference" TEXT NOT NULL DEFAULT 'auto',
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "aiSuggestions" BOOLEAN NOT NULL DEFAULT true,
    "autoSave" BOOLEAN NOT NULL DEFAULT true,
    "trackingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultSectionOrder" TEXT[],
    "preferredRoleType" TEXT,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CareerMemory_userId_key" ON "CareerMemory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_resumeId_key" ON "Application"("resumeId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerMemory" ADD CONSTRAINT "CareerMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkHistory" ADD CONSTRAINT "WorkHistory_careerMemoryId_fkey" FOREIGN KEY ("careerMemoryId") REFERENCES "CareerMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bullet" ADD CONSTRAINT "Bullet_workHistoryId_fkey" FOREIGN KEY ("workHistoryId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Education" ADD CONSTRAINT "Education_careerMemoryId_fkey" FOREIGN KEY ("careerMemoryId") REFERENCES "CareerMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_careerMemoryId_fkey" FOREIGN KEY ("careerMemoryId") REFERENCES "CareerMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_careerMemoryId_fkey" FOREIGN KEY ("careerMemoryId") REFERENCES "CareerMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_careerMemoryId_fkey" FOREIGN KEY ("careerMemoryId") REFERENCES "CareerMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_careerMemoryId_fkey" FOREIGN KEY ("careerMemoryId") REFERENCES "CareerMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeSection" ADD CONSTRAINT "ResumeSection_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeBullet" ADD CONSTRAINT "ResumeBullet_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeBullet" ADD CONSTRAINT "ResumeBullet_bulletId_fkey" FOREIGN KEY ("bulletId") REFERENCES "Bullet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EnableRowLevelSecurity
-- The application uses server-side Prisma ownership checks. RLS remains
-- default-deny defense in depth for any Data API exposure; no broad public
-- policies or grants are created here.
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CareerMemory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bullet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Education" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Skill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Certification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Achievement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Resume" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResumeSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResumeBullet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserPreferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SystemConfig" ENABLE ROW LEVEL SECURITY;
