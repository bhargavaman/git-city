import { BATTLE_START_LABEL, RIVALRY } from "./rivalry";
import { SIDES, battleWeekNumber, type Side } from "./battle-rules";
import {
  ACTIVITIES,
  PRIZE_CREDITS,
  PRIZE_SPONSOR,
  TEAM_BONUS,
  capFor,
  pointsFor,
  type Activity,
  type FeaturedActivity,
  type PlayPhase,
} from "./play-rules";
import type { PlayWeekRow, SideBonus } from "./play-score";

// Every line the /towns "This week" section shows, built from play-rules.ts
// so the poster, the rules page and the scoring can't drift apart. The hero
// already says how a side wins, so nothing here repeats it. Client-safe.

/** Short labels for the poster's card; the rules page uses ACTIVITY_COPY's full ones. */
const SHORT_LABEL: Record<Activity, string> = {
  floors: "Floor outside your town",
  raids: "Raid won",
  visits: "Town visit",
  kudos: "Kudos given",
  code: "Coded that day",
};

export interface ScoringRow {
  activity: Activity;
  label: string;
  /** "1 pt", "20 pts", doubled in the featured week. */
  pts: string;
  /** "200/day", or null when one action already hits the cap (coding). */
  cap: string | null;
  /** The week's 2× activity. Coding never is. */
  doubled: boolean;
}

export function scoringRows(featured: FeaturedActivity | null): ScoringRow[] {
  return ACTIVITIES.map((a) => {
    const pts = pointsFor(a, featured);
    const cap = capFor(a, featured);
    return {
      activity: a,
      label: SHORT_LABEL[a],
      pts: `${pts} ${pts === 1 ? "pt" : "pts"}`,
      cap: cap === pts ? null : `${cap}/day`,
      doubled: a === featured,
    };
  });
}

/** The two team categories, added to a side's score at the close. */
export function teamRows(): { label: string; pts: string }[] {
  return [
    { label: "Town that grew most", pts: `+${TEAM_BONUS}` },
    { label: "Most visited town", pts: `+${TEAM_BONUS}` },
  ];
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
  return phase === "practice" ? "Practice week" : "This week";
}

/** The top 10 card's note: what the ranking is worth right now. */
export function prizeNote(phase: PlayPhase, sponsor: "Firecrawl" | null = PRIZE_SPONSOR): string {
  if (phase === "before" || phase === "practice") return `Prizes start ${BATTLE_START_LABEL}`;
  if (phase === "ended") return "Season over";
  if (sponsor) return `${PRIZE_CREDITS.toLocaleString("en-US")} ${sponsor} credits each`;
  return "Named every Monday";
}

export function winnersLine(w: LastWinners): string {
  return `Week ${w.number} winners: ${w.logins.map((l) => `@${l}`).join(", ")}`;
}

/** "Codex" in its color, then the rest of the line. */
export function bonusLine(b: SideBonus): { name: string; color: string; rest: string } {
  const r = RIVALRY[SIDES.indexOf(b.side)];
  return { name: r.name, color: r.color, rest: `+${b.pct}% prize points · smaller side` };
}

export function sideColor(side: Side | null): string | null {
  return side ? RIVALRY[SIDES.indexOf(side)].color : null;
}
