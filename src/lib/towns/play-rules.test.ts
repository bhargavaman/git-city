import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTIVITIES,
  ACTIVITY_COPY,
  BONUS_MAX_PCT,
  CAPS,
  FEATURED_ROTATION,
  POINTS,
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
  it("runs 4 prize weeks from Mon Oct 12", () => {
    expect(BATTLE_START).toBe(Date.parse("2026-10-12T00:00:00Z"));
    expect(SEASON_END).toBe(Date.parse("2026-11-09T00:00:00Z"));
  });
});

describe("playPhase", () => {
  it("is before until Mon Oct 12", () => {
    expect(playPhase(Date.parse("2026-10-11T23:59:59Z"))).toBe("before");
  });

  it("is prize from Mon Oct 12 to the end of Sun Nov 8", () => {
    expect(playPhase(Date.parse("2026-10-12T00:00:00Z"))).toBe("prize");
    expect(playPhase(Date.parse("2026-11-08T23:59:59Z"))).toBe("prize");
  });

  it("is ended from Mon Nov 9", () => {
    expect(playPhase(Date.parse("2026-11-09T00:00:00Z"))).toBe("ended");
  });
});

describe("featuredFor", () => {
  it("has no double activity before or after the season", () => {
    expect(featuredFor("2026-10-05")).toBeNull();
    expect(featuredFor("2026-11-09")).toBeNull();
  });

  it("follows the published rotation", () => {
    expect(featuredFor("2026-10-12")).toBe("floors");
    expect(featuredFor("2026-10-19")).toBe("raids");
    expect(featuredFor("2026-10-26")).toBe("visits");
    expect(featuredFor("2026-11-02")).toBe("kudos");
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

// vitest runs from the repo root (vitest.config.ts lives there).
const MIGRATION_167 = resolve(process.cwd(), "supabase/migrations/167_town_play.sql");

function migration167(): string {
  return readFileSync(MIGRATION_167, "utf8");
}

function all(sql: string, re: RegExp): number[][] {
  return [...sql.matchAll(re)].map((m) => m.slice(1).map(Number));
}

describe("migration 167 caps", () => {
  it("caps floors at CAPS.floors everywhere, one point per floor", () => {
    const sql = migration167();
    const found = [
      /CHECK \(floors BETWEEN 0 AND (\d+)\)/g,
      /GREATEST\(floor\(\(e->>'n'\)::numeric\), 0\), (\d+)\)/g,
      /CASE WHEN v_n >= (\d+) THEN now\(\) END/g,
      /LEAST\(d\.floors \+ EXCLUDED\.floors, (\d+)\)/g,
      /d\.floors \+ EXCLUDED\.floors >= (\d+)/g,
      /LEAST\(t\.floors, (\d+)\) AS floors/g,
    ].map((re) => all(sql, re));
    for (const hits of found) expect(hits).toEqual([[CAPS.floors]]);
    // play_day_points returns the floor count as points.
    expect(POINTS.floors).toBe(1);
  });

  it("caps raid wins", () => {
    expect(all(migration167(), /LEAST\((\d+)\*count\(\*\) FILTER \(WHERE success\), (\d+)\)/g)).toEqual([
      [POINTS.raids, CAPS.raids],
    ]);
  });

  it("caps town visits", () => {
    expect(all(migration167(), /LEAST\((\d+)\*count\(\*\), (\d+)\)\s+FROM public\.town_visits/g)).toEqual([
      [POINTS.visits, CAPS.visits],
    ]);
  });

  it("caps kudos", () => {
    expect(all(migration167(), /LEAST\((\d+)\*count\(\*\), (\d+)\)\s+FROM public\.developer_kudos/g)).toEqual([
      [POINTS.kudos, CAPS.kudos],
    ]);
  });

  it("scores a coding day once", () => {
    expect(all(migration167(), /0, 0, 0, 0, (\d+)\s+FROM public\.league_weekly_stats/g)).toEqual([[CAPS.code]]);
    expect(POINTS.code).toBe(CAPS.code);
  });

  it("caps the smaller-side bonus", () => {
    expect(all(migration167(), /CHECK \(bonus_pct BETWEEN 0 AND (\d+)\)/g)).toEqual([[BONUS_MAX_PCT]]);
  });
});
