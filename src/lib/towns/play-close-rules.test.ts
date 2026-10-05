import { describe, expect, it } from "vitest";
import {
  growthBySide,
  lastDay,
  mergeSeen,
  refetchTargets,
  shiftWeek,
  visitsBySide,
  weekTotals,
} from "./play-close-rules";

const ids = { claude: "L-claude", codex: "L-codex" };
const WEEK = "2026-10-12";
const NEXT = "2026-10-19";

describe("shiftWeek / lastDay", () => {
  it("moves a Monday by whole weeks", () => {
    expect(shiftWeek("2026-10-12", 1)).toBe("2026-10-19");
    expect(shiftWeek("2026-10-12", -1)).toBe("2026-10-05");
    expect(shiftWeek("2026-10-26", 1)).toBe("2026-11-02");
  });

  it("ends the week on Sunday", () => {
    expect(lastDay("2026-10-12")).toBe("2026-10-18");
    expect(lastDay("2026-10-26")).toBe("2026-11-01");
  });
});

describe("growthBySide", () => {
  const counted = new Set([1, 2, 3, 4, 5]);

  it("counts members whose town row was created this week", () => {
    const rows = [
      { developer_id: 1, league_id: "L-claude", status: "active", created_at: "2026-10-13T10:00:00Z" },
      { developer_id: 2, league_id: "L-codex", status: "active", created_at: "2026-10-18T23:59:00Z" },
    ];
    expect(growthBySide(rows, ids, counted, WEEK, NEXT)).toEqual({ claude: 1, codex: 1 });
  });

  it("ignores a rejoin: the row keeps its first created_at", () => {
    const rows = [{ developer_id: 1, league_id: "L-claude", status: "active", created_at: "2026-09-30T08:00:00Z" }];
    expect(growthBySide(rows, ids, counted, WEEK, NEXT)).toEqual({ claude: 0, codex: 0 });
  });

  it("ignores a side switch: an older row in the other war town", () => {
    const rows = [
      { developer_id: 3, league_id: "L-claude", status: "active", created_at: "2026-10-12T00:10:00Z" },
      { developer_id: 3, league_id: "L-codex", status: "former", created_at: "2026-10-01T09:00:00Z" },
    ];
    expect(growthBySide(rows, ids, counted, WEEK, NEXT)).toEqual({ claude: 0, codex: 0 });
  });

  it("ignores members who left before the close, alts, and rows outside the week", () => {
    const rows = [
      { developer_id: 4, league_id: "L-claude", status: "former", created_at: "2026-10-14T00:00:00Z" },
      { developer_id: 9, league_id: "L-claude", status: "active", created_at: "2026-10-14T00:00:00Z" },
      { developer_id: 5, league_id: "L-codex", status: "active", created_at: "2026-10-19T00:00:00Z" },
    ];
    expect(growthBySide(rows, ids, counted, WEEK, NEXT)).toEqual({ claude: 0, codex: 0 });
  });

  it("gives 0 to a side whose town is missing", () => {
    const rows = [{ developer_id: 1, league_id: "L-claude", status: "active", created_at: "2026-10-13T10:00:00Z" }];
    expect(growthBySide(rows, { claude: null, codex: "L-codex" }, counted, WEEK, NEXT)).toEqual({ claude: 0, codex: 0 });
  });
});

describe("visitsBySide", () => {
  const counted = new Set([1, 2, 3, 4]);
  const sideOf = new Map<number, "claude" | "codex" | null>([
    [1, null],
    [2, null],
    [3, "claude"],
    [4, "codex"],
    [5, null],
  ]);

  it("counts only counted visitors on neither side, once per day and once per person", () => {
    const rows = [
      { league_id: "L-claude", developer_id: 1, day: "2026-10-12" },
      { league_id: "L-claude", developer_id: 1, day: "2026-10-13" },
      { league_id: "L-claude", developer_id: 2, day: "2026-10-12" },
      { league_id: "L-claude", developer_id: 4, day: "2026-10-12" }, // Codex player: never a visitor
      { league_id: "L-claude", developer_id: 5, day: "2026-10-12" }, // fails the alt checks
      { league_id: "L-codex", developer_id: 3, day: "2026-10-14" }, // Claude player
      { league_id: "L-codex", developer_id: 1, day: "2026-10-14" },
      { league_id: "L-other", developer_id: 2, day: "2026-10-14" }, // not a war town
    ];
    expect(visitsBySide(rows, ids, counted, sideOf)).toEqual({
      visitDays: { claude: 3, codex: 1 },
      uniqueVisitors: { claude: 2, codex: 1 },
    });
  });

  it("drops visitors who aren't players at all", () => {
    const rows = [{ league_id: "L-codex", developer_id: 77, day: "2026-10-14" }];
    expect(visitsBySide(rows, ids, new Set([77]), sideOf)).toEqual({
      visitDays: { claude: 0, codex: 0 },
      uniqueVisitors: { claude: 0, codex: 0 },
    });
  });
});

describe("refetchTargets", () => {
  const ranked = [
    { developer_id: 1, login: "a" },
    { developer_id: 2, login: "b" },
    { developer_id: 3, login: "c" },
  ];
  const players = [
    { developer_id: 1, login: "a", side: "claude" as const, account_created_at: null },
    { developer_id: 2, login: "b", side: null, account_created_at: "2020-01-01T00:00:00Z" },
    { developer_id: 3, login: "c", side: null, account_created_at: null },
    { developer_id: 4, login: "d", side: "codex" as const, account_created_at: null },
    { developer_id: 5, login: "e", side: null, account_created_at: null },
  ];

  it("re-fetches the top N and asks createdAt for the top M or war players with none", () => {
    const { top, needCreated } = refetchTargets(ranked, players, 2, 2);
    expect(top).toEqual([
      { developer_id: 1, login: "a" },
      { developer_id: 2, login: "b" },
    ]);
    expect(needCreated).toEqual([
      { developer_id: 1, login: "a" },
      { developer_id: 4, login: "d" },
    ]);
  });
});

describe("weekTotals", () => {
  it("maps each ranked entry's developer_id to its total (not its prize points)", () => {
    const m = weekTotals([
      { developer_id: 7, total: 40 },
      { developer_id: 3, total: 12 },
    ]);
    expect([...m]).toEqual([
      [7, 40],
      [3, 12],
    ]);
  });
});

describe("mergeSeen", () => {
  it("unions each player's hashes across the week, sorted", () => {
    const m = mergeSeen([
      { developer_id: 1, seen: ["h2", "h1"] },
      { developer_id: 1, seen: ["h1", "h3"] },
      { developer_id: 2, seen: null },
    ]);
    expect(m.get(1)).toEqual(["h1", "h2", "h3"]);
    expect(m.get(2)).toEqual([]);
  });
});
