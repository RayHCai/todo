import { describe, expect, it } from "vitest";
import { lists } from "../../test/fixtures";
import { buildCommands, matchCommands } from "./commands";

const commands = buildCommands(lists(), "2026-10-14");
const labels = (query: string) => matchCommands(commands, query).map((c) => `${c.group}: ${c.label}`);

describe("console commands", () => {
  it("offers every page, every list, and a place to add for each", () => {
    expect(labels("")).toEqual([
      "Go to: Day view",
      "Go to: Month view",
      "Go to: Lists",
      "Go to: Home",
      "Go to: Work",
      "Add to: Today",
      "Add to: Tomorrow",
      "Add to: This Week",
      "Add to: Goals for October",
      "Add to: Home",
      "Add to: Work",
      "Add to: A new list",
    ]);
  });

  it("matches every typed word against the group, label and keywords", () => {
    expect(labels("add work")).toEqual(["Add to: Work"]);
    expect(labels("home")).toEqual(["Go to: Home", "Add to: Home"]);
    expect(labels("calendar")).toEqual(["Go to: Month view"]);
    expect(labels("zzz")).toEqual([]);
  });

  it("ranks label prefixes first within a group", () => {
    expect(labels("w")).toEqual(["Go to: Work", "Go to: Day view", "Add to: Work", "Add to: This Week"]);
    expect(labels("tom")).toEqual(["Go to: Day view", "Add to: Tomorrow"]);
  });

  it("counts a list's open tasks", () => {
    expect(commands.find((c) => c.id === "go-list-home")?.hint).toBe("2 open");
  });
});
