import { isoDay, weekEnd, weekStart } from "@/lib/leagues/scoring";
import { battleWeekNumber, type Side } from "./battle-rules";
import {
  ACTIVITIES,
  ACTIVITY_COPY,
  GROWTH_BY,
  ONE_PRIZE_PER_SEASON,
  PRIZE_DELIVERY,
  PRIZE_SPONSOR,
  TEAM_BONUS,
  capNote,
  featuredFor,
  playPhase,
  pointsFor,
  type Activity,
  type FeaturedActivity,
  type PlayPhase,
} from "./play-rules";
import type { PlayWeekRow } from "./play-score";

export type RulesBonus = { state: "pending" } | { state: "even" } | { state: "smaller"; side: Side; pct: number };

/** Everything /towns/rules shows, already resolved for `now`. Pure, so it is tested without the DB. */
export interface PlayRulesView {
  activities: { key: Activity; label: string; pts: number; capNote: string; doubled: boolean }[];
  teamBonus: number;
  phase: PlayPhase;
  week: { number: number; start: string; end: string; endsAt: number } | null;
  featured: FeaturedActivity | null;
  bonus: RulesBonus;
  sponsor: "Firecrawl" | null;
  delivery: "reply" | "code";
  onePrizePerSeason: boolean;
  growthBy: "count" | "share";
}

// The close of week N writes the bonus for week N+1 into week N's row (next_bonus),
// so during a prize week the newest row holds the bonus that applies now.
function bonusFrom(row: Pick<PlayWeekRow, "next_bonus"> | null): RulesBonus {
  if (!row) return { state: "pending" };
  const b = row.next_bonus;
  if (!b || b.pct <= 0) return { state: "even" };
  return { state: "smaller", side: b.side, pct: b.pct };
}

export function rulesView(now: number, row: Pick<PlayWeekRow, "next_bonus"> | null): PlayRulesView {
  const phase = playPhase(now);
  const start = weekStart(new Date(now));
  const end = weekEnd(start);
  const prize = phase === "prize";
  // The 2x activity comes from the published rotation, never from the DB.
  const featured = prize ? featuredFor(isoDay(start)) : null;

  return {
    activities: ACTIVITIES.map((key) => ({
      key,
      // ACTIVITY_COPY[key] is { label, name, unit }; the table row shows the label only.
      label: ACTIVITY_COPY[key].label,
      pts: pointsFor(key, featured),
      capNote: capNote(key, featured),
      doubled: featured === key,
    })),
    teamBonus: TEAM_BONUS,
    phase,
    week: prize
      ? { number: battleWeekNumber(isoDay(start)), start: isoDay(start), end: isoDay(end), endsAt: end.getTime() }
      : null,
    featured,
    bonus: prize ? bonusFrom(row) : { state: "pending" },
    sponsor: PRIZE_SPONSOR,
    delivery: PRIZE_DELIVERY,
    onePrizePerSeason: ONE_PRIZE_PER_SEASON,
    growthBy: GROWTH_BY,
  };
}
