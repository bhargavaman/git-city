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

  it("stays short: under 150 words in any state", () => {
    const words = (x: unknown): number =>
      typeof x === "string" ? x.split(/\s+/).filter(Boolean).length : x && typeof x === "object" ? Object.values(x).reduce((n: number, y) => n + words(y), 0) : 0;
    for (const v of views()) expect(words(rulesCopy(v))).toBeLessThan(150);
  });
});

describe("rulesCopy lines", () => {
  const base = rulesView(PHASES.prize, null);

  it("picks the status chip by phase", () => {
    expect(rulesCopy(rulesView(PHASES.before, null)).status).toEqual({ text: "Starts Mon, Oct 12", endsAt: null });
    expect(rulesCopy(base).status).toEqual({ text: "Week 1 of 4 · ends in", endsAt: Date.UTC(2026, 9, 19) });
    expect(rulesCopy(rulesView(PHASES.ended, null)).status).toEqual({ text: "Season over", endsAt: null });
  });

  it("doubles the week's activity in the play card", () => {
    const rows = rulesCopy(base).play.rows;
    expect(rows[0]).toMatchObject({ activity: "floors", pts: "2 pts", cap: "400/day", doubled: true });
    expect(rows.filter((r) => r.doubled)).toHaveLength(1);
  });

  it("says how a side wins in 4 lines", () => {
    expect(rulesCopy(base).war.lines).toEqual([
      "Higher average points per player wins",
      "Needs 3 players who scored",
      "+25 town that grew most",
      "+25 most visited town",
    ]);
  });

  it("shows the live smaller-side bonus, or its maximum", () => {
    expect(rulesCopy(rulesView(PHASES.prize, { next_bonus: { side: "codex", pct: 16 } })).prize.bonus).toEqual({
      side: "codex",
      text: "Codex +16% this week (smaller side)",
    });
    expect(rulesCopy(base).prize.bonus).toEqual({ side: null, text: "Smaller side gets up to +20%" });
  });

  it("names the sponsor's credits only when there is one", () => {
    expect(rulesCopy({ ...base, sponsor: null }).prize).toMatchObject({ big: "Top 10", sub: "every week" });
    expect(rulesCopy({ ...base, sponsor: "Firecrawl" }).prize.sub).toBe("10,000 Firecrawl credits each");
    expect(rulesCopy(base).prize.who[0]).toBe("GitHub account before Sep 8, 2026");
  });

  it("links the report to a public GitHub issue", () => {
    expect(rulesCopy(base).fair.report.href).toBe("https://github.com/srizzon/git-city/issues/new?title=Towns%20report%3A%20%40");
  });

  it("marks the current week", () => {
    const weeks = (now: number) => rulesCopy(rulesView(now, null)).weeks;
    expect(weeks(PHASES.prize).map((w) => w.current)).toEqual([true, false, false, false]);
    expect(weeks(at(2026, 10, 20)).map((w) => w.current)).toEqual([false, true, false, false]);
    expect(weeks(PHASES.before).some((w) => w.current)).toBe(false);
    expect(weeks(PHASES.prize).map((w) => `${w.dates} ${w.double}`)).toEqual(["Oct 12 2× Floors", "Oct 19 2× Raids", "Oct 26 2× Visits", "Nov 2 2× Kudos"]);
  });
});
