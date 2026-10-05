import { describe, expect, it } from "vitest";
import { rulesView, type PlayRulesView } from "@/lib/towns/play-rules-view";
import { rulesCopy } from "./copy";

const at = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h);
const PHASES = { before: at(2026, 10, 5), practice: at(2026, 10, 14), prize: at(2026, 10, 20), over: at(2026, 11, 20) };

function views(): PlayRulesView[] {
  const out: PlayRulesView[] = [];
  const rows = [null, { next_bonus: null }, { next_bonus: { side: "codex" as const, pct: 16 } }];
  for (const now of Object.values(PHASES))
    for (const row of rows)
      for (const sponsor of [null, "Firecrawl"] as const)
        for (const onePrizePerSeason of [false, true])
          for (const growthBy of ["count", "share"] as const)
            for (const delivery of ["reply", "code"] as const)
              out.push({ ...rulesView(now, row), sponsor, onePrizePerSeason, growthBy, delivery });
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
});

describe("rulesCopy lines", () => {
  const base = rulesView(PHASES.prize, null);

  it("keeps the headline and the two lines under it", () => {
    const c = rulesCopy(base);
    expect(c.sub).toBe(
      "Everything you do in Git City scores, with a daily cap. The side with the most points per player wins.",
    );
    expect(c.lines).toEqual(["The smaller side gets bonus prize points.", "One activity counts double each week."]);
  });

  it("picks the status chip by phase", () => {
    expect(rulesCopy(rulesView(PHASES.before, null)).status).toEqual({
      text: "Practice week starts Mon, Oct 12 · Prizes start Mon, Oct 19",
      endsAt: null,
    });
    expect(rulesCopy(rulesView(PHASES.practice, null)).status.text).toBe(
      "Practice week · nothing at stake · Prizes start Mon, Oct 19",
    );
    expect(rulesCopy(base).status).toEqual({ text: "Week 1 of 4 · ends in", endsAt: Date.UTC(2026, 9, 26) });
    expect(rulesCopy(rulesView(PHASES.over, null)).status).toEqual({ text: "This season ended Nov 15.", endsAt: null });
  });

  it("says when the first bonus is set until a close wrote one", () => {
    expect(rulesCopy(base).bonus.live?.text).toBe("The first bonus is set Mon, Oct 19.");
    expect(rulesCopy(rulesView(PHASES.practice, null)).bonus.live?.text).toBe("The first bonus is set Mon, Oct 19.");
    expect(rulesCopy(rulesView(PHASES.over, null)).bonus.live).toBeNull();
  });

  it("names the smaller side and its bonus", () => {
    const c = rulesCopy(rulesView(PHASES.prize, { next_bonus: { side: "codex", pct: 16 } }));
    expect(c.bonus.live?.text).toBe("This week: Codex is smaller, so Codex players get +16% prize points.");
    expect(rulesCopy(rulesView(PHASES.prize, { next_bonus: null })).bonus.live?.text).toBe(
      "This week: the sides are even. No bonus.",
    );
  });

  it("renders every points row label as a plain string", () => {
    for (const v of views()) for (const r of rulesCopy(v).points.rows) expect(typeof r.label).toBe("string");
  });

  it("tags the 2x row in a prize week and says nothing doubles in practice", () => {
    const c = rulesCopy(base);
    expect(c.points.rows[0]).toMatchObject({ pts: "2", cap: "400", tag: "2× this week", compact: "2 pts · 400/day" });
    expect(c.points.rows.filter((r) => r.tag)).toHaveLength(1);
    expect(c.double.live).toBe("This week: Floors.");
    expect(rulesCopy(rulesView(PHASES.practice, null)).double.live).toBe("Nothing counts double in the practice week.");
    expect(rulesCopy(rulesView(PHASES.over, null)).double.live).toBeNull();
  });

  it("keeps the raid row at 3 raids when raids double", () => {
    const raids = rulesCopy(rulesView(at(2026, 10, 27), null)).points.rows[1];
    expect(raids).toMatchObject({ pts: "20", cap: "60 (3 raids)", tag: "2× this week", compact: "20 pts · 60/day" });
  });

  it("puts the team bonus in the war list", () => {
    expect(rulesCopy(base).war.steps[2]).toBe(`Each team category a side wins adds +${base.teamBonus} to its score.`);
  });

  it("switches the growth line by the growth rule", () => {
    expect(rulesCopy({ ...base, growthBy: "count" }).categories.items[0].text).toContain("gained the most new members");
    expect(rulesCopy({ ...base, growthBy: "share" }).categories.items[0].text).toContain("grew the most for its size");
  });

  it("uses the Sep 8 account line, not 30 days", () => {
    const who = rulesCopy(base).who.items.join(" ");
    expect(who).toContain("Your GitHub account was created before Sep 8, 2026.");
    expect(who).not.toMatch(/30\+? days/);
  });

  it("shows the sponsor prize and its delivery line only with a sponsor", () => {
    const glory = rulesCopy({ ...base, sponsor: null });
    expect(glory.prize.lines[0]).toBe(
      "The 10 players with the most points each week are named on /towns and in our Monday post.",
    );
    expect(glory.sponsorLine).toBeNull();

    const reply = rulesCopy({ ...base, sponsor: "Firecrawl", delivery: "reply" });
    expect(reply.prize.lines[0]).toBe("The 10 players with the most points each week win 10,000 Firecrawl credits each.");
    expect(reply.prize.lines).toContain(
      "We email winners after the Monday check. Reply with the email of your Firecrawl account and we pass it on.",
    );
    expect(reply.sponsorLine).toBe("Prizes by Firecrawl.");
    expect(rulesCopy({ ...base, sponsor: "Firecrawl", delivery: "code" }).prize.lines).toContain(
      "We email each winner a code after the Monday check.",
    );
  });

  it("lists 10 checks with the report link last", () => {
    const c = rulesCopy(base);
    expect(c.checks.rows.map((r) => r.term)).toEqual([
      "Floors", "Raids", "Visits", "Kudos", "Coding", "Daily caps", "Accounts", "Every Monday", "In public", "Report",
    ]);
    expect(c.checks.report.href).toBe("https://github.com/srizzon/git-city/issues/new?title=Towns%20report%3A%20%40");
  });

  it("marks the current week in the dates table", () => {
    const rows = (now: number) => rulesCopy(rulesView(now, null)).dates.rows;
    expect(rows(PHASES.practice).map((r) => r.current)).toEqual([true, false, false, false, false]);
    expect(rows(PHASES.prize).map((r) => r.current)).toEqual([false, true, false, false, false]);
    expect(rows(PHASES.before).some((r) => r.current)).toBe(false);
    expect(rows(PHASES.over).some((r) => r.current)).toBe(false);
    expect(rows(PHASES.prize).map((r) => r.double)).toEqual(["none, nothing at stake", "Floors", "Raids", "Visits", "Kudos"]);
  });
});
