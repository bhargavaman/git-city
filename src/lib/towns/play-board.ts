import { BATTLE_START_LABEL, RIVALRY } from "./rivalry";
import { SIDES, battleWeekNumber, type Side } from "./battle-rules";
import {
  ACCOUNT_CUTOFF_LABEL,
  ACTIVITIES,
  ACTIVITY_COPY,
  PRIZE_CREDITS,
  PRIZE_SPONSOR,
  PRIZE_WINNERS,
  TEAM_BONUS,
  capFor,
  pointsFor,
  type Activity,
  type FeaturedActivity,
  type PlayPhase,
} from "./play-rules";
import type { PlayWeekRow, SideBonus } from "./play-score";

// Every line the /towns scoring table and "Players this week" show, built
// from play-rules.ts so the poster, the rules page and the scoring can't
// drift apart. Client-safe: the poster renders the table.

export const SCORING_HEADLINE = "Everything you do in Git City scores, with a daily cap. The side with the most points per player wins.";
export const SCORING_LINES = ["The smaller side gets bonus prize points.", "One activity counts double each week."] as const;

export interface ScoringRow {
  activity: Activity;
  label: string;
  /** "1 pt · 200/day", doubled in the featured week. */
  value: string;
  /** The week's 2× activity. Coding never is. */
  doubled: boolean;
}

/** The poster's compact cap, "200/day". The rules page uses capNote's longer text. */
export function posterCap(a: Activity, featured: FeaturedActivity | null): string {
  return `${capFor(a, featured)}/day`;
}

export function scoringRows(featured: FeaturedActivity | null): ScoringRow[] {
  return ACTIVITIES.map((a) => {
    const pts = pointsFor(a, featured);
    return {
      activity: a,
      label: ACTIVITY_COPY[a].label,
      value: `${pts} ${pts === 1 ? "pt" : "pts"} · ${posterCap(a, featured)}`,
      doubled: a !== "code" && a === featured,
    };
  });
}

export function teamLine(): string {
  return `Each week, +${TEAM_BONUS} to the side whose town grew the most, and +${TEAM_BONUS} to the most visited.`;
}

export interface LastWinners {
  week: string;
  number: number;
  logins: string[];
}

type EndedWeek = Pick<PlayWeekRow, "week_start" | "next_bonus" | "winners" | "published_at">;

/**
 * What the week that just ended hands the live board: the bonus it set for
 * this week (prize weeks only) and its winners once Sam published them.
 */
export function boardWeek(prev: EndedWeek | null, phase: PlayPhase): { bonus: SideBonus | null; lastWinners: LastWinners | null } {
  if (!prev) return { bonus: null, lastWinners: null };
  const bonus = phase === "prize" && prev.next_bonus && prev.next_bonus.pct > 0 ? prev.next_bonus : null;
  const lastWinners =
    prev.published_at && prev.winners && prev.winners.length > 0
      ? { week: prev.week_start, number: battleWeekNumber(prev.week_start), logins: prev.winners }
      : null;
  return { bonus, lastWinners };
}

export function boardHeading(phase: PlayPhase): string {
  return phase === "practice" ? "Practice week" : "Players this week";
}

export function prizeLine(phase: PlayPhase, sponsor: "Firecrawl" | null = PRIZE_SPONSOR): string {
  if (phase === "before" || phase === "practice") return `Nothing at stake this week. Prizes start ${BATTLE_START_LABEL}.`;
  if (phase === "ended") return "The prize weeks are over.";
  if (sponsor) return `Top ${PRIZE_WINNERS} players each week win ${PRIZE_CREDITS.toLocaleString("en-US")} ${sponsor} credits.`;
  return `The top ${PRIZE_WINNERS} each week are named here and in our Monday post.`;
}

export function finePrint(): string {
  return `Prizes need a GitHub account created before ${ACCOUNT_CUTOFF_LABEL}, with its building claimed before the week starts. Ties go to more days played, then to whoever joined Git City first.`;
}

export function sponsorLine(sponsor: "Firecrawl" | null = PRIZE_SPONSOR): string | null {
  return sponsor ? `Prizes by ${sponsor}.` : null;
}

export function winnersLine(w: LastWinners): string {
  return `Week ${w.number} winners: ${w.logins.map((l) => `@${l}`).join(", ")}`;
}

/** "Codex" in its color, then the rest of the line. */
export function bonusLine(b: SideBonus): { name: string; color: string; rest: string } {
  const r = RIVALRY[SIDES.indexOf(b.side)];
  return { name: r.name, color: r.color, rest: `is smaller this week: +${b.pct}% prize points.` };
}

export function sideColor(side: Side | null): string | null {
  return side ? RIVALRY[SIDES.indexOf(side)].color : null;
}
