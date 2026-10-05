import { describe, expect, it } from "vitest";
import { ACTIVITIES, capFor, pointsFor, PRIZE_SPONSOR, TEAM_BONUS } from "./play-rules";
import {
  boardHeading,
  boardWeek,
  bonusLine,
  finePrint,
  posterCap,
  prizeLine,
  scoringRows,
  sideColor,
  sponsorLine,
  SCORING_HEADLINE,
  SCORING_LINES,
  teamLine,
  winnersLine,
} from "./play-board";

describe("play-rules numbers this board relies on", () => {
  it("doubles points and cap for the featured activity only", () => {
    expect(ACTIVITIES.map((a) => [pointsFor(a, null), capFor(a, null)])).toEqual([[1, 200], [10, 30], [10, 30], [5, 25], [20, 20]]);
    expect([pointsFor("floors", "floors"), capFor("floors", "floors")]).toEqual([2, 400]);
    expect([pointsFor("code", "floors"), capFor("code", "floors")]).toEqual([20, 20]);
  });
});

describe("scoringRows", () => {
  it("formats the poster cap as N/day from capFor", () => {
    expect(posterCap("floors", null)).toBe("200/day");
    expect(posterCap("floors", "floors")).toBe("400/day");
    expect(posterCap("raids", null)).toBe("30/day");
  });

  it("lists the 5 activities in order with points and cap", () => {
    const rows = scoringRows(null);
    expect(rows.map((r) => r.activity)).toEqual([...ACTIVITIES]);
    expect(rows.map((r) => r.value)).toEqual(["1 pt · 200/day", "10 pts · 30/day", "10 pts · 30/day", "5 pts · 25/day", "20 pts · 20/day"]);
    expect(rows.some((r) => r.doubled)).toBe(false);
  });

  it("doubles the featured row's points and cap, and only that row", () => {
    const rows = scoringRows("floors");
    expect(rows[0]).toMatchObject({ activity: "floors", value: "2 pts · 400/day", doubled: true });
    expect(rows.filter((r) => r.doubled)).toHaveLength(1);
    expect(rows.find((r) => r.activity === "code")).toMatchObject({ value: "20 pts · 20/day", doubled: false });
  });
});

describe("poster lines", () => {
  it("says the headline and the two dynamic rules verbatim", () => {
    expect(SCORING_HEADLINE).toBe("Everything you do in Git City scores, with a daily cap. The side with the most points per player wins.");
    expect(SCORING_LINES).toEqual(["The smaller side gets bonus prize points.", "One activity counts double each week."]);
  });

  it("builds the team line from TEAM_BONUS", () => {
    expect(teamLine()).toBe(`Each week, +${TEAM_BONUS} to the side whose town grew the most, and +${TEAM_BONUS} to the most visited.`);
  });
});

describe("players block copy", () => {
  it("names the practice week only during it", () => {
    expect(boardHeading("practice")).toBe("Practice week");
    expect(boardHeading("before")).toBe("Players this week");
    expect(boardHeading("prize")).toBe("Players this week");
    expect(boardHeading("ended")).toBe("Players this week");
  });

  it("states the prize by phase, with and without a sponsor", () => {
    expect(prizeLine("prize", "Firecrawl")).toBe("Top 10 players each week win 10,000 Firecrawl credits.");
    expect(prizeLine("prize", null)).toBe("The top 10 each week are named here and in our Monday post.");
    expect(prizeLine("practice", "Firecrawl")).toBe("Nothing at stake this week. Prizes start Mon, Oct 19.");
    expect(prizeLine("before", "Firecrawl")).toBe("Nothing at stake this week. Prizes start Mon, Oct 19.");
    expect(prizeLine("ended", "Firecrawl")).toBe("The prize weeks are over.");
  });

  it("uses the fixed account cutoff in the fine print", () => {
    expect(finePrint()).toBe(
      "Prizes need a GitHub account created before Sep 8, 2026, with its building claimed before the week starts. Ties go to more days played, then to whoever joined Git City first.",
    );
  });

  it("shows the sponsor line only with a sponsor", () => {
    expect(sponsorLine(null)).toBeNull();
    expect(sponsorLine("Firecrawl")).toBe("Prizes by Firecrawl.");
  });

  it("lists last week's winners as logins", () => {
    expect(winnersLine({ week: "2026-10-19", number: 1, logins: ["ana", "bo"] })).toBe("Week 1 winners: @ana, @bo");
  });

  it("names the smaller side in its color", () => {
    expect(bonusLine({ side: "codex", pct: 16 })).toEqual({ name: "Codex", color: "#5b8def", rest: "is smaller this week: +16% prize points." });
    expect(sideColor("claude")).toBe("#e07a4f");
    expect(sideColor(null)).toBeNull();
  });

  it("never says what the rules forbid while there is no sponsor", () => {
    expect(PRIZE_SPONSOR).toBeNull();
    const all = [
      SCORING_HEADLINE,
      ...SCORING_LINES,
      ...scoringRows(null).flatMap((r) => [r.label, r.value]),
      ...scoringRows("kudos").flatMap((r) => [r.label, r.value]),
      teamLine(),
      boardHeading("practice"),
      boardHeading("prize"),
      prizeLine("before"),
      prizeLine("practice"),
      prizeLine("prize"),
      prizeLine("ended"),
      finePrint(),
      sponsorLine() ?? "",
      bonusLine({ side: "claude", pct: 5 }).rest,
    ].join("\n");
    expect(all).not.toMatch(/firecrawl|credits|per dev|\bpay|money|raffle|\bdm\b|2,135|30\+ days/i);
  });
});

describe("boardWeek", () => {
  const ended = { week_start: "2026-10-19", next_bonus: { side: "codex" as const, pct: 16 }, winners: ["ana", "bo"], published_at: "2026-10-26T12:00:00Z" };

  it("is empty before any close", () => {
    expect(boardWeek(null, "prize")).toEqual({ bonus: null, lastWinners: null });
  });

  it("takes this week's bonus from the ended week's row during a prize week", () => {
    expect(boardWeek(ended, "prize")).toEqual({
      bonus: { side: "codex", pct: 16 },
      lastWinners: { week: "2026-10-19", number: 1, logins: ["ana", "bo"] },
    });
  });

  it("shows no bonus outside prize weeks or at 0%", () => {
    expect(boardWeek(ended, "practice").bonus).toBeNull();
    expect(boardWeek(ended, "ended").bonus).toBeNull();
    expect(boardWeek({ ...ended, next_bonus: { side: "codex", pct: 0 } }, "prize").bonus).toBeNull();
  });

  it("shows winners only once the week is published", () => {
    expect(boardWeek({ ...ended, published_at: null }, "prize").lastWinners).toBeNull();
    expect(boardWeek({ ...ended, winners: null }, "prize").lastWinners).toBeNull();
  });
});
