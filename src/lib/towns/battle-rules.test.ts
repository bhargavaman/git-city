import { describe, expect, it } from "vitest";
import { isoDay } from "@/lib/leagues/scoring";
import { battlePhase, battleWeekNumber, dayWinners, finishedDays, seriesRecord } from "./battle-rules";
import { BATTLE_START } from "./rivalry";

describe("battlePhase", () => {
  it("picks sides until the first battle Monday", () => {
    expect(battlePhase(BATTLE_START - 1)).toBe("pick");
    expect(battlePhase(BATTLE_START)).toBe("live");
  });
});

describe("dayWinners", () => {
  it("marks finished days only, ties for nobody", () => {
    const claude = [10, 5, 7, 0, 0, 0, 0];
    const codex = [8, 5, 9, 0, 0, 0, 0];
    expect(dayWinners(claude, codex, 3)).toEqual(["claude", null, "codex", "open", "open", "open", "open"]);
  });

  it("gives a day nobody coded to nobody", () => {
    expect(dayWinners([0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], 7)).toEqual([null, null, null, null, null, null, null]);
  });
});

describe("finishedDays", () => {
  const monday = new Date("2026-10-12T00:00:00Z");
  it("counts whole days since Monday", () => {
    expect(finishedDays(monday, Date.parse("2026-10-12T15:00:00Z"))).toBe(0);
    expect(finishedDays(monday, Date.parse("2026-10-14T00:00:00Z"))).toBe(2);
    expect(finishedDays(monday, Date.parse("2026-10-25T00:00:00Z"))).toBe(7);
  });
});

describe("seriesRecord", () => {
  it("counts week wins, skipping ties", () => {
    expect(seriesRecord(["claude", null, "codex", "claude"])).toEqual({ claude: 2, codex: 1 });
  });
});

describe("battleWeekNumber", () => {
  it("counts from the first battle Monday", () => {
    const first = isoDay(new Date(BATTLE_START));
    const second = isoDay(new Date(BATTLE_START + 7 * 86_400_000));
    expect(battleWeekNumber(first)).toBe(1);
    expect(battleWeekNumber(second)).toBe(2);
  });

  it("starts on Oct 19: Oct 12-18 is the practice week", () => {
    expect(battleWeekNumber("2026-10-19")).toBe(1);
    expect(battleWeekNumber("2026-10-26")).toBe(2);
    expect(battleWeekNumber("2026-10-12")).toBe(0);
  });
});
