-- CreateEnum
CREATE TYPE "TodoScope" AS ENUM ('DAY', 'WEEK');

-- CreateTable
CREATE TABLE "Todo" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(2000),
    "scope" "TodoScope" NOT NULL,
    "date" DATE NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "completedAt" TIMESTAMPTZ,
    "completedOn" DATE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "color" VARCHAR(20) NOT NULL,
    "month" DATE NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "completedAt" TIMESTAMPTZ,
    "completedOn" DATE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "passwordFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Todo_scope_date_idx" ON "Todo"("scope", "date");

-- CreateIndex
CREATE INDEX "Todo_completedOn_idx" ON "Todo"("completedOn");

-- CreateIndex
CREATE INDEX "Goal_month_idx" ON "Goal"("month");

-- CreateIndex
CREATE INDEX "Goal_completedOn_idx" ON "Goal"("completedOn");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
