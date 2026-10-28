-- CreateTable
CREATE TABLE "List" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "color" VARCHAR(20) NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "List_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListTask" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "date" DATE,
    "position" DOUBLE PRECISION NOT NULL,
    "completedAt" TIMESTAMPTZ,
    "completedOn" DATE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ListTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListTask_listId_idx" ON "ListTask"("listId");

-- AddForeignKey
ALTER TABLE "ListTask" ADD CONSTRAINT "ListTask_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;
