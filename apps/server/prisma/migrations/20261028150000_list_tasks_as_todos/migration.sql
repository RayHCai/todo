-- List tasks become ordinary todos that belong to a list, so a dated one shows on the board
-- and in the calendar like any other todo.

-- AlterTable
ALTER TABLE "Todo" ADD COLUMN "listId" TEXT;
ALTER TABLE "Todo" ALTER COLUMN "date" DROP NOT NULL;

-- Move existing list tasks over, keeping their ids.
INSERT INTO "Todo" ("id", "title", "scope", "date", "position", "completedAt", "completedOn", "createdAt", "updatedAt", "listId")
SELECT "id", "title", 'DAY', "date", "position", "completedAt", "completedOn", "createdAt", "updatedAt", "listId"
FROM "ListTask";

-- DropTable
DROP TABLE "ListTask";

-- CreateIndex
CREATE INDEX "Todo_listId_idx" ON "Todo"("listId");

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only a list task may go without a date.
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_date_or_list_check" CHECK ("date" IS NOT NULL OR "listId" IS NOT NULL);
