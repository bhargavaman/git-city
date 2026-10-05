import { BATTLE_START } from "./rivalry";

// ─── Towns play rules (pure, client-safe) ───────────────────
// The one source of every number in the Towns war and the weekly prize. The
// scorer, the poster, the rules page and the SQL parity test all read it, so
// the numbers can't drift apart. No server imports: the poster is a client
// component.

export type Activity = "floors" | "raids" | "visits" | "kudos" | "code";
/** Coding is never the activity that counts double. */
export type FeaturedActivity = Exclude<Activity, "code">;

/** Table order, as on the poster and the rules page. */
export const ACTIVITIES: readonly Activity[] = ["floors", "raids", "visits", "kudos", "code"];

export const POINTS: Readonly<Record<Activity, number>> = { floors: 1, raids: 10, visits: 10, kudos: 5, code: 20 };

// Daily caps in points. Migration 167 play_day_points hard-codes these;
// play-rules.test.ts checks the SQL.
export const CAPS: Readonly<Record<Activity, number>> = { floors: 200, raids: 30, visits: 30, kudos: 25, code: 20 };

export const ACTIVITY_COPY: Readonly<Record<Activity, { label: string; name: string; unit: string | null }>> = {
  floors: { label: "Knock down a floor of a building outside your town", name: "Floors", unit: null },
  raids: { label: "Win a raid in the main city", name: "Raids", unit: "raids" },
  visits: { label: "Visit another town", name: "Visits", unit: "towns" },
  kudos: { label: "Give kudos", name: "Kudos", unit: "kudos" },
  code: { label: "Code that day (1+ GitHub contribution)", name: "Coding", unit: null },
};

function mult(a: Activity, featured: FeaturedActivity | null): number {
  return a === featured ? 2 : 1;
}

/** Points per action. The week's featured activity counts 2×. */
export function pointsFor(a: Activity, featured: FeaturedActivity | null): number {
  return POINTS[a] * mult(a, featured);
}

/** Daily cap in points. The featured activity's cap doubles too. */
export function capFor(a: Activity, featured: FeaturedActivity | null): number {
  return CAPS[a] * mult(a, featured);
}

/** "200", "30 (3 raids)". A doubled activity scores the same number of actions: "60 (3 raids)". */
export function capNote(a: Activity, featured: FeaturedActivity | null): string {
  const cap = capFor(a, featured);
  const unit = ACTIVITY_COPY[a].unit;
  return unit ? `${cap} (${cap / pointsFor(a, featured)} ${unit})` : String(cap);
}

// War. TEAM_BONUS is Q2 (Sam sets it Oct 15); GROWTH_BY is Q1.
export const TEAM_BONUS = 25;
export const SIDE_MIN_SCORERS = 3;
export const MOST_VISITED_MIN = 5;
export const GROWTH_BY: "count" | "share" = "share";

// Smaller-side bonus, prize points only.
export const BONUS_FACTOR = 25;
export const BONUS_MAX_PCT = 20;

// Prize and the Monday check.
export const PRIZE_WINNERS = 10;
export const CHECK_TOP = 15;
export const REFETCH_TOP = 30;
export const ACCOUNT_CUTOFF = "2026-09-08";
export const ACCOUNT_CUTOFF_LABEL = "Sep 8, 2026";

// Pending decisions: each answer is a one-line change here.
export const PRIZE_SPONSOR: "Firecrawl" | null = null;
/** Credits per winner. A number: copy formats it with toLocaleString("en-US"). */
export const PRIZE_CREDITS: number = 10_000;
export const PRIZE_DELIVERY: "reply" | "code" = "reply";
export const ONE_PRIZE_PER_SEASON: boolean = true;

// Season: a practice week, then 4 prize weeks from BATTLE_START.
const DAY = 86_400_000;
export const SEASON_WEEKS = 4;
export const PRACTICE_START = BATTLE_START - 7 * DAY;
export const SEASON_END = BATTLE_START + SEASON_WEEKS * 7 * DAY;

/** The activity that counts double, by week start (UTC Monday). Published in advance. */
export const FEATURED_ROTATION: Readonly<Record<string, FeaturedActivity>> = {
  "2026-10-19": "floors",
  "2026-10-26": "raids",
  "2026-11-02": "visits",
  "2026-11-09": "kudos",
};

/** The week's 2× activity, or null (practice week, after the season, or not a week start). */
export function featuredFor(weekStartDay: string): FeaturedActivity | null {
  return Object.hasOwn(FEATURED_ROTATION, weekStartDay) ? FEATURED_ROTATION[weekStartDay] : null;
}

export type PlayPhase = "before" | "practice" | "prize" | "ended";

export function playPhase(now: number): PlayPhase {
  if (now < PRACTICE_START) return "before";
  if (now < BATTLE_START) return "practice";
  if (now < SEASON_END) return "prize";
  return "ended";
}

/** Prize-point bonus % for the smaller side: 50 vs 19 gives 16, equal sides 0, never above 20. */
export function smallerSideBonus(big: number, small: number): number {
  if (big <= 0 || small >= big) return 0;
  return Math.min(BONUS_MAX_PCT, Math.round(((big - small) / big) * BONUS_FACTOR));
}

export const RULES_PATH = "/towns/rules";
export const REPORT_URL = "https://github.com/srizzon/git-city/issues/new?title=Towns%20report%3A%20%40";
