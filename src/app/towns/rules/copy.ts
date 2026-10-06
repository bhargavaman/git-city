import { BATTLE_START_LABEL, RIVALRY } from "@/lib/towns/rivalry";
import { SIDES } from "@/lib/towns/battle-rules";
import {
  ACCOUNT_CUTOFF_LABEL,
  FEATURED_ROTATION,
  PRIZE_CREDITS,
  PRIZE_WINNERS,
  REPORT_URL,
  SEASON_WEEKS,
  SIDE_MIN_SCORERS,
  TEAM_BONUS,
  type FeaturedActivity,
} from "@/lib/towns/play-rules";
import type { PlayRulesView } from "@/lib/towns/play-rules-view";

// Every line /towns/rules shows. Short on purpose: one fact per line, and
// nothing the score card or the dates table already says.

export const RULES_META = {
  title: "Towns rules - Git City",
  description: "How you score, how a side wins and how you win a prize in Git City Towns.",
};

const FEATURED_NAME: Record<FeaturedActivity, string> = {
  floors: "Floors",
  raids: "Raids",
  visits: "Visits",
  kudos: "Kudos",
};

/** Short dates for the 4 prize weeks, in FEATURED_ROTATION order. */
const WEEK_DATES = ["Oct 12–18", "Oct 19–25", "Oct 26 – Nov 1", "Nov 2–8"];

/** A big value over a muted line, for the "This week" tiles. */
export interface Tile {
  big: string;
  /** Side whose color paints `big`, or null for lime. */
  side: (typeof SIDES)[number] | null;
  sub: string;
}

export interface RulesCopy {
  status: { text: string; endsAt: number | null };
  scoreNote: string;
  tiles: Tile[] | null;
  war: { title: string; steps: string[] };
  prize: { title: string; lead: string; who: string[] };
  fair: { title: string; lines: string[]; report: { label: string; href: string } };
  dates: { title: string; rows: { week: string; dates: string; double: string; current: boolean }[] };
}

function status(v: PlayRulesView): RulesCopy["status"] {
  if (v.phase === "before") return { text: `Starts ${BATTLE_START_LABEL}`, endsAt: null };
  if (v.phase === "prize" && v.week) return { text: `Week ${v.week.number} of ${SEASON_WEEKS} · ends in`, endsAt: v.week.endsAt };
  return { text: "Season over", endsAt: null };
}

function tiles(v: PlayRulesView): Tile[] | null {
  if (v.phase === "ended") return null;
  // Before the season: week 1's double, so the page already shows what's coming.
  if (v.phase !== "prize") {
    const first = Object.values(FEATURED_ROTATION)[0];
    return [{ big: `2× ${FEATURED_NAME[first]}`, side: null, sub: "Counts double in week 1" }];
  }
  const double: Tile = v.featured
    ? { big: `2× ${FEATURED_NAME[v.featured]}`, side: null, sub: "Points and cap double" }
    : { big: "No 2×", side: null, sub: "Nothing counts double" };
  const b = v.bonus;
  const bonus: Tile =
    b.state === "smaller"
      ? { big: `+${b.pct}% ${RIVALRY[SIDES.indexOf(b.side)].name}`, side: b.side, sub: "Prize points, smaller side" }
      : b.state === "even"
        ? { big: "No bonus", side: null, sub: "The sides are even" }
        : { big: "No bonus", side: null, sub: "Set at Monday's close" };
  return [double, bonus];
}

export function rulesCopy(v: PlayRulesView): RulesCopy {
  const prizeWeeks = Object.values(FEATURED_ROTATION).map((a, i) => ({
    week: String(i + 1),
    dates: WEEK_DATES[i],
    double: `2× ${FEATURED_NAME[a]}`,
    current: v.phase === "prize" && v.week?.number === i + 1,
  }));
  const who = [
    `GitHub account created before ${ACCOUNT_CUTOFF_LABEL}`,
    "Building claimed before the week starts",
    "1+ point from something other than coding",
  ];
  if (v.onePrizePerSeason) who.push("One prize per player for the season");

  return {
    status: status(v),
    scoreNote: "Days reset at 00:00 UTC.",
    tiles: tiles(v),
    war: {
      title: "How a side wins",
      steps: [
        "Average points of its players who scored",
        `Needs ${SIDE_MIN_SCORERS} players to have a score`,
        `+${TEAM_BONUS} town that grew most · +${TEAM_BONUS} most visited`,
      ],
    },
    prize: {
      title: "The prize",
      lead: v.sponsor
        ? `Top ${PRIZE_WINNERS} each week · ${PRIZE_CREDITS.toLocaleString("en-US")} ${v.sponsor} credits each`
        : `Top ${PRIZE_WINNERS} each week · named every Monday`,
      who,
    },
    fair: {
      title: "Fair play",
      lines: [
        "Points are counted on our servers, with daily caps.",
        "Every Monday a person checks the top 15 by hand.",
        "Alts and new accounts don't count.",
      ],
      report: { label: "See something off? Open an issue →", href: REPORT_URL },
    },
    dates: {
      title: "Dates",
      rows: prizeWeeks,
    },
  };
}
