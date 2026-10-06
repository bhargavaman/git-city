import { describe, expect, it } from "vitest";
import { rulesView, type PlayRulesView } from "@/lib/towns/play-rules-view";
import { rulesCopy } from "./copy";

const at = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h);
const PHASES = { before: at(2026, 10, 5), prize: at(2026, 10, 13), ended: at(2026, 11, 20) };

function views(): PlayRulesView[] {
  const out: PlayRulesView[] = [];
  const rows = [null, { next_bonus: null }, { next_bonus: { side: "codex" as const, pct: 16 } }];
  for (const now of Object.values(PHASES))
    for (const row of rows)
      for (const sponsor of [null, "Firecrawl"] as const)
        for (const onePrizePerSeason of [false, true]) out.push({ ...rulesView(now, row), sponsor, onePrizePerSeason });
  return out;
}

const text = (v: PlayRulesView) => JSON.stringify(rulesCopy(v));

describe("rulesCopy never says what §11.7 forbids", () => {
  const FORBIDDEN =
    /jumps|FloorBudget|150\/min|excluded|claimed_by|user-agent|\bIP\b|per dev|codes more|DM us|\bpay\b|payment|raffle|2,135|2135|80%/i;

  it("has no hidden flag, money, DM or sizing words in any state", () => {
    for (const v of views()) expect(text(v)).not.toMatch(FORBIDDEN);
  });

  it("names no sponsor and no credits while the sponsor is null", () => {
    for (const v of views().filter((x) => x.sponsor === null)) expect(text(v)).not.toMatch(/firecrawl|credits/i);
  });

  it("shows the one-prize line only when that rule is on", () => {
    for (const v of views()) expect(text(v).includes("One prize per player")).toBe(v.onePrizePerSeason);
  });

  it("stays short: under 200 words in any state", () => {
    const words = (x: unknown): number =>
      typeof x === "string" ? x.split(/\s+/).filter(Boolean).length : x && typeof x === "object" ? Object.values(x).reduce((n: number, y) => n + words(y), 0) : 0;
    for (const v of views()) expect(words(rulesCopy(v))).toBeLessThan(200);
  });
});

describe("rulesCopy lines", () => {
  const base = rulesView(PHASES.prize, null);

  it("picks the status chip by phase", () => {
    expect(rulesCopy(rulesView(PHASES.before, null)).status).toEqual({ text: "Starts Mon, Oct 12", endsAt: null });
    expect(rulesCopy(base).status).toEqual({ text: "Week 1 of 4 · ends in", endsAt: Date.UTC(2026, 9, 19) });
    expect(rulesCopy(rulesView(PHASES.ended, null)).status).toEqual({ text: "Season over", endsAt: null });
  });

  it("shows the week's 2× and bonus as tiles", () => {
    expect(rulesCopy(rulesView(PHASES.prize, { next_bonus: { side: "codex", pct: 16 } })).tiles).toEqual([
      { big: "2× Floors", side: null, sub: "Points and cap double" },
      { big: "+16% Codex", side: "codex", sub: "Prize points, smaller side" },
    ]);
    expect(rulesCopy(rulesView(PHASES.prize, { next_bonus: null })).tiles?.[1]).toMatchObject({ big: "No bonus" });
    expect(rulesCopy(rulesView(PHASES.before, null)).tiles).toEqual([{ big: "2× Floors", side: null, sub: "Counts double in week 1" }]);
    expect(rulesCopy(rulesView(PHASES.prize, null)).tiles?.[1]).toEqual({ big: "No bonus", side: null, sub: "Set at Monday's close" });
    expect(rulesCopy(rulesView(PHASES.ended, null)).tiles).toBeNull();
  });

  it("says how a side wins in 3 lines", () => {
    expect(rulesCopy(base).war.steps).toEqual([
      "Average points of its players who scored",
      "Needs 3 players to have a score",
      "+25 town that grew most · +25 most visited",
    ]);
  });

  it("leads the prize with the sponsor only when there is one", () => {
    expect(rulesCopy({ ...base, sponsor: null }).prize.lead).toBe("Top 10 each week · named every Monday");
    expect(rulesCopy({ ...base, sponsor: "Firecrawl" }).prize.lead).toBe("Top 10 each week · 10,000 Firecrawl credits each");
    expect(rulesCopy(base).prize.who[0]).toBe("GitHub account created before Sep 8, 2026");
  });

  it("links the report to a public GitHub issue", () => {
    expect(rulesCopy(base).fair.report.href).toBe("https://github.com/srizzon/git-city/issues/new?title=Towns%20report%3A%20%40");
  });

  it("marks the current week in the dates table", () => {
    const rows = (now: number) => rulesCopy(rulesView(now, null)).dates.rows;
    expect(rows(PHASES.prize).map((r) => r.current)).toEqual([true, false, false, false]);
    expect(rows(at(2026, 10, 20)).map((r) => r.current)).toEqual([false, true, false, false]);
    expect(rows(PHASES.before).some((r) => r.current)).toBe(false);
    expect(rows(PHASES.ended).some((r) => r.current)).toBe(false);
    expect(rows(PHASES.prize).map((r) => r.double)).toEqual(["2× Floors", "2× Raids", "2× Visits", "2× Kudos"]);
  });
});
