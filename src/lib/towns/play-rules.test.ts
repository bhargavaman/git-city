import { describe, expect, it } from "vitest";
import {
  ACTIVITIES,
  ACTIVITY_COPY,
  CAPS,
  FEATURED_ROTATION,
  PRACTICE_START,
  PRIZE_CREDITS,
  PRIZE_SPONSOR,
  SEASON_END,
  capFor,
  capNote,
  featuredFor,
  playPhase,
  pointsFor,
  smallerSideBonus,
} from "./play-rules";
import { BATTLE_START } from "./rivalry";

describe("season dates", () => {
  it("starts the prize weeks Mon Oct 19, after a practice week from Oct 12, for 4 weeks", () => {
    expect(BATTLE_START).toBe(Date.parse("2026-10-19T00:00:00Z"));
    expect(PRACTICE_START).toBe(Date.parse("2026-10-12T00:00:00Z"));
    expect(SEASON_END).toBe(Date.parse("2026-11-16T00:00:00Z"));
  });
});

describe("playPhase", () => {
  it("is before until the practice week opens", () => {
    expect(playPhase(Date.parse("2026-10-11T12:00:00Z"))).toBe("before");
    expect(playPhase(Date.parse("2026-10-11T23:59:59Z"))).toBe("before");
  });

  it("is practice from Mon Oct 12 to the end of Sun Oct 18", () => {
    expect(playPhase(Date.parse("2026-10-12T00:00:00Z"))).toBe("practice");
    expect(playPhase(Date.parse("2026-10-18T23:59:59Z"))).toBe("practice");
  });

  it("is prize from Mon Oct 19 to the end of Sun Nov 15", () => {
    expect(playPhase(Date.parse("2026-10-19T00:00:00Z"))).toBe("prize");
    expect(playPhase(Date.parse("2026-11-15T23:59:59Z"))).toBe("prize");
  });

  it("is ended from Mon Nov 16", () => {
    expect(playPhase(Date.parse("2026-11-16T00:00:00Z"))).toBe("ended");
  });
});

describe("featuredFor", () => {
  it("has no double activity in the practice week or after the season", () => {
    expect(featuredFor("2026-10-12")).toBeNull();
    expect(featuredFor("2026-11-16")).toBeNull();
  });

  it("follows the published rotation", () => {
    expect(featuredFor("2026-10-19")).toBe("floors");
    expect(featuredFor("2026-10-26")).toBe("raids");
    expect(featuredFor("2026-11-02")).toBe("visits");
    expect(featuredFor("2026-11-09")).toBe("kudos");
  });

  it("ignores keys that aren't week starts", () => {
    expect(featuredFor("constructor")).toBeNull();
    expect(featuredFor("")).toBeNull();
  });

  it("never doubles coding", () => {
    expect(Object.values(FEATURED_ROTATION)).not.toContain("code");
    expect(Object.keys(FEATURED_ROTATION)).toHaveLength(4);
  });
});

describe("points and caps", () => {
  it("keeps the table order and values", () => {
    expect(ACTIVITIES).toEqual(["floors", "raids", "visits", "kudos", "code"]);
    expect(CAPS).toEqual({ floors: 200, raids: 30, visits: 30, kudos: 25, code: 20 });
    expect(ACTIVITIES.map((a) => pointsFor(a, null))).toEqual([1, 10, 10, 5, 20]);
  });

  it("doubles points and cap only for the featured activity", () => {
    expect(pointsFor("floors", "floors")).toBe(2);
    expect(capFor("floors", "floors")).toBe(400);
    expect(capFor("raids", "raids")).toBe(60);
    expect(capFor("raids", "floors")).toBe(30);
    expect(capFor("code", "floors")).toBe(20);
    expect(pointsFor("code", "floors")).toBe(20);
  });

  it("writes the daily cap the way the rules table shows it", () => {
    expect(ACTIVITIES.map((a) => capNote(a, null))).toEqual(["200", "30 (3 raids)", "30 (3 towns)", "25 (5 kudos)", "20"]);
    expect(capNote("floors", "floors")).toBe("400");
    expect(capNote("raids", "raids")).toBe("60 (3 raids)");
    expect(capNote("kudos", "kudos")).toBe("50 (5 kudos)");
  });

  it("names every activity for the tables and the double line", () => {
    expect(ACTIVITY_COPY.floors.label).toBe("Knock down a floor of a building outside your town");
    expect(ACTIVITY_COPY.code.label).toBe("Code that day (1+ GitHub contribution)");
    expect(ACTIVITIES.map((a) => ACTIVITY_COPY[a].name)).toEqual(["Floors", "Raids", "Visits", "Kudos", "Coding"]);
  });
});

describe("smallerSideBonus", () => {
  it("gives 16% at 50 against 19", () => {
    expect(smallerSideBonus(50, 19)).toBe(16);
  });

  it("gives nothing to equal or empty sides", () => {
    expect(smallerSideBonus(40, 40)).toBe(0);
    expect(smallerSideBonus(0, 0)).toBe(0);
  });

  it("stops at 20%", () => {
    expect(smallerSideBonus(100, 1)).toBe(20);
    expect(smallerSideBonus(10, 0)).toBe(20);
  });
});

describe("sponsor", () => {
  it("stays unnamed until Firecrawl confirms", () => {
    expect(PRIZE_SPONSOR).toBeNull();
  });

  it("keeps the prize as a number that copy formats", () => {
    expect(PRIZE_CREDITS).toBe(10_000);
    expect(PRIZE_CREDITS.toLocaleString("en-US")).toBe("10,000");
  });
});
