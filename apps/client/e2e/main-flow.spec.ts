import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "./env";

async function unlock(page: Page) {
  await page.goto("/");
  const password = page.getByLabel("Password");
  await expect(password).toBeFocused();
  await password.fill(E2E_PASSWORD);
  await password.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Let the curtains and the entrance settle.
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await page.waitForTimeout(1200);
}

const column = (page: Page, name: string) => page.locator(`[data-column="${name}"]`);

test("rejects a wrong password and keeps focus in the field", async ({ page }) => {
  await page.goto("/");
  const password = page.getByLabel("Password");
  await password.fill("not the password");
  await page.waitForTimeout(500);
  await password.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("That's not it.");
  await expect(password).toBeFocused();
  await expect(password).toHaveValue("");
});

test("main flow: add, complete, goals, calendar, lock", async ({ page }) => {
  await unlock(page);

  // Add a todo from each column header; each lands in its own column.
  for (const [col, label, title] of [
    ["today", /Add todo for Today/, "E2E today item"],
    ["tomorrow", /Add todo for Tomorrow/, "E2E tomorrow item"],
    ["week", /Add todo for This Week/, "E2E week item"],
  ] as const) {
    await page.getByRole("button", { name: label }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Title")).toBeFocused();
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Title").press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(column(page, col).getByRole("button", { name: title })).toBeVisible();
  }

  // Complete one and see it move under Completed in the same column.
  const today = column(page, "today");
  await today.getByRole("checkbox", { name: "Complete E2E today item" }).check();
  await page.waitForTimeout(250);
  const reopen = today.getByRole("checkbox", { name: "Reopen E2E today item" });
  await expect(reopen).toBeVisible();
  await expect(reopen).toBeChecked();
  await page.waitForTimeout(700);

  // Add a goal, then achieve it and find it in the tray.
  await page.getByRole("button", { name: "Add goal" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("E2E goal");
  await dialog.getByRole("radio", { name: "teal" }).click();
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog).toHaveCount(0);
  const goals = page.getByRole("region", { name: /Goals\. Use the arrow keys/ });
  const goalCheck = goals.getByRole("checkbox", { name: "Mark E2E goal achieved" });
  await goalCheck.scrollIntoViewIfNeeded();
  await goalCheck.check();
  await page.waitForTimeout(450);
  await expect(goals.getByRole("checkbox", { name: "Reopen E2E goal" })).toBeAttached();
  await page.waitForTimeout(700);

  // The calendar shows today's completed item on today's cell.
  await page.getByRole("button", { name: "Open calendar" }).click();
  const calendar = page.getByRole("dialog", { name: "History calendar" });
  await expect(calendar).toBeVisible();
  await expect(page).toHaveURL(/\?calendar=\d{4}-\d{2}/);
  await page.waitForTimeout(900);
  const todayCell = calendar.locator("[data-week-of-today] button[aria-label]").filter({ hasText: "E2E today item" });
  await expect(todayCell).toHaveCount(1);
  await todayCell.click();
  await expect(page.getByRole("dialog").filter({ hasText: "Completed" }).last()).toContainText("E2E today item");
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);

  // Lock: the curtains close and the lock screen is back.
  await page.getByRole("button", { name: "Lock" }).click();
  await page.waitForTimeout(500);
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
});

test("delete shows an undo toast that restores the item", async ({ page }) => {
  await unlock(page);
  const tomorrow = column(page, "tomorrow");
  await page.getByRole("button", { name: /Add todo for Tomorrow/ }).click();
  await page.getByRole("dialog").getByLabel("Title").fill("E2E delete me");
  await page.getByRole("dialog").getByLabel("Title").press("Enter");
  await tomorrow.getByRole("button", { name: "E2E delete me" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(tomorrow.getByRole("button", { name: "E2E delete me" })).toHaveCount(0);
  const toast = page.getByRole("status").filter({ hasText: "Deleted" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(tomorrow.getByRole("button", { name: "E2E delete me" })).toBeVisible();
  // It's really back on the server.
  await page.reload();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(column(page, "tomorrow").getByRole("button", { name: "E2E delete me" })).toBeVisible();
});

test("phone layout: tabs and a bottom-sheet modal", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await unlock(page);
  await page.getByRole("tab", { name: "Tomorrow" }).click();
  await expect(page.getByRole("tab", { name: "Tomorrow" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: /Add todo for Tomorrow/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(500);
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(scroll).toBeLessThanOrEqual(0);
  await context.close();
});
