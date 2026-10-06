import { describe, expect, it } from "vitest";
import { ACTIVITIES, capFor, pointsFor, PRIZE_SPONSOR, TEAM_BONUS } from "./play-rules";
import { boardHeading, boardWeek, bonusLine, emptyLine, prizeNote, scoringRows, sideColor, teamRows, winnersLine } from "./play-board";

describe("play-rules numbers this board relies on", () => {
  it("doubles points and cap for the featured activity only", () => {
    expect(ACTIVITIES.map((a) => [pointsFor(a, null), capFor(a, null)])).toEqual([[1, 200], [10, 30], [10, 30], [5, 25], [20, 20]]);
    expect([pointsFor("floors", "floors"), capFor("floors", "floors")]).toEqual([2, 400]);
    expect([pointsFor("code", "floors"), capFor("code", "floors")]).toEqual([20, 20]);
  });
});

describe("scoringRows", () => {
  it("lists the 5 activities in order with short labels, points and cap", () => {
    const rows = scoringRows(null);
    expect(rows.map((r) => r.activity)).toEqual([...ACTIVITIES]);
    expect(rows.map((r) => r.label)).toEqual(["Floor outside your town", "Raid won", "Town visit", "Kudos given", "Coded that day"]);
    expect(rows.map((r) => [r.pts, r.cap])).toEqual([
      ["1 pt", "200/day"],
      ["10 pts", "30/day"],
      ["10 pts", "30/day"],
      ["5 pts", "25/day"],
      ["20 pts", null],
    ]);
    expect(rows.some((r) => r.doubled)).toBe(false);
  });

  it("doubles the featured row's points and cap, and only that row", () => {
    const rows = scoringRows("floors");
    expect(rows[0]).toMatchObject({ activity: "floors", pts: "2 pts", cap: "400/day", doubled: true });
    expect(rows.filter((r) => r.doubled)).toHaveLength(1);
    expect(rows.find((r) => r.activity === "code")).toMatchObject({ pts: "20 pts", cap: null, doubled: false });
  });

  it("builds the team rows from TEAM_BONUS", () => {
    expect(teamRows()).toEqual([
      { label: "Town that grew most", pts: `+${TEAM_BONUS}` },
      { label: "Most visited town", pts: `+${TEAM_BONUS}` },
    ]);
  });
});

describe("this week copy", () => {
  it("calls it this week, and last week once the season is over", () => {
    expect(boardHeading("before")).toBe("This week");
    expect(boardHeading("prize")).toBe("This week");
    expect(boardHeading("ended")).toBe("Last week");
  });

  it("notes the prize by phase, with and without a sponsor", () => {
    expect(prizeNote("prize", "Firecrawl")).toBe("10,000 Firecrawl credits each");
    expect(prizeNote("prize", null)).toBe("Named every Monday");
    expect(prizeNote("before", "Firecrawl")).toBeNull();
    expect(emptyLine("before")).toBe("Points count from Mon, Oct 12");
    expect(emptyLine("prize")).toBe("Nobody scored yet");
    expect(prizeNote("ended", "Firecrawl")).toBe("Season over");
  });

  it("lists last week's winners as logins", () => {
    expect(winnersLine({ week: "2026-10-19", number: 1, logins: ["ana", "bo"] })).toBe("Week 1 winners: @ana, @bo");
  });

  it("names the smaller side in its color", () => {
    expect(bonusLine({ side: "codex", pct: 16 })).toEqual({ name: "Codex", color: "#5b8def", rest: "+16% prize points · smaller side" });
    expect(sideColor("claude")).toBe("#e07a4f");
    expect(sideColor(null)).toBeNull();
  });

  it("never says what the rules forbid while there is no sponsor", () => {
    expect(PRIZE_SPONSOR).toBeNull();
    const all = [
      ...scoringRows(null).flatMap((r) => [r.label, r.pts, r.cap ?? ""]),
      ...scoringRows("kudos").flatMap((r) => [r.label, r.pts, r.cap ?? ""]),
      ...teamRows().flatMap((r) => [r.label, r.pts]),
      boardHeading("before"),
      boardHeading("prize"),
      emptyLine("before"),
      prizeNote("prize"),
      prizeNote("ended"),
      bonusLine({ side: "claude", pct: 5 }).rest,
    ].join("\n");
    expect(all).not.toMatch(/firecrawl|credits|per dev|\bpay|money|raffle|\bdm\b|2,135|30\+ days/i);
  });
});

describe("boardWeek", () => {
  const ended = { week_start: "2026-10-12", next_bonus: { side: "codex" as const, pct: 16 }, winners: ["ana", "bo"], published_at: "2026-10-26T12:00:00Z" };

  it("is empty before any close", () => {
    expect(boardWeek(null, "prize")).toEqual({ bonus: null, lastWinners: null });
  });

  it("takes this week's bonus from the ended week's row during a prize week", () => {
    expect(boardWeek(ended, "prize")).toEqual({
      bonus: { side: "codex", pct: 16 },
      lastWinners: { week: "2026-10-12", number: 1, logins: ["ana", "bo"] },
    });
  });

  it("shows no bonus outside prize weeks or at 0%", () => {
    expect(boardWeek(ended, "before").bonus).toBeNull();
    expect(boardWeek(ended, "ended").bonus).toBeNull();
    expect(boardWeek({ ...ended, next_bonus: { side: "codex", pct: 0 } }, "prize").bonus).toBeNull();
  });

  it("shows winners only once the week is published", () => {
    expect(boardWeek({ ...ended, published_at: null }, "prize").lastWinners).toBeNull();
    expect(boardWeek({ ...ended, winners: null }, "prize").lastWinners).toBeNull();
  });
});
