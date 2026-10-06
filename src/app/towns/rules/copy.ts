import { RIVALRY } from "@/lib/towns/rivalry";
import { SIDES, type Side } from "@/lib/towns/battle-rules";
import {
  ACCOUNT_CUTOFF_LABEL,
  BONUS_MAX_PCT,
  FEATURED_ROTATION,
  PRIZE_CREDITS,
  PRIZE_WINNERS,
  REPORT_URL,
  SEASON_WEEKS,
  SIDE_MIN_SCORERS,
  TEAM_BONUS,
  type FeaturedActivity,
} from "@/lib/towns/play-rules";
import { scoringRows, type ScoringRow } from "@/lib/towns/play-board";
import type { PlayRulesView } from "@/lib/towns/play-rules-view";

// /towns/rules in three cards (play, win the week, win a prize), the four
// weeks and one line on fair play. One fact per line, nothing repeated.

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

/** Start days of the 4 weeks, in FEATURED_ROTATION order. */
const WEEK_DATES = ["Oct 12", "Oct 19", "Oct 26", "Nov 2"];

export interface RulesCopy {
  status: { text: string; endsAt: number | null };
  play: { title: string; rows: ScoringRow[]; note: string };
  war: { title: string; lines: string[] };
  prize: { title: string; big: string; sub: string; bonus: { side: Side | null; text: string }; who: string[] };
  weeks: { label: string; dates: string; double: string; current: boolean }[];
  fair: { line: string; report: { label: string; href: string } };
}

function status(v: PlayRulesView): RulesCopy["status"] {
  if (v.phase === "before") return { text: "Starts Mon, Oct 12", endsAt: null };
  if (v.phase === "prize" && v.week) return { text: `Week ${v.week.number} of ${SEASON_WEEKS} · ends in`, endsAt: v.week.endsAt };
  return { text: "Season over", endsAt: null };
}

function bonus(v: PlayRulesView): RulesCopy["prize"]["bonus"] {
  if (v.bonus.state === "smaller") {
    return { side: v.bonus.side, text: `${RIVALRY[SIDES.indexOf(v.bonus.side)].name} +${v.bonus.pct}% this week (smaller side)` };
  }
  return { side: null, text: `Smaller side gets up to +${BONUS_MAX_PCT}%` };
}

export function rulesCopy(v: PlayRulesView): RulesCopy {
  const who = [`GitHub account before ${ACCOUNT_CUTOFF_LABEL}`, "Building claimed before the week", "1+ point not from coding"];
  if (v.onePrizePerSeason) who.push("One prize per player");

  return {
    status: status(v),
    play: { title: "1 · Play", rows: scoringRows(v.featured), note: "Caps reset 00:00 UTC" },
    war: {
      title: "2 · Win the week",
      lines: [
        "Higher average points per player wins",
        `Needs ${SIDE_MIN_SCORERS} players who scored`,
        `+${TEAM_BONUS} town that grew most`,
        `+${TEAM_BONUS} most visited town`,
      ],
    },
    prize: {
      title: "3 · Win a prize",
      big: `Top ${PRIZE_WINNERS}`,
      sub: v.sponsor ? `${PRIZE_CREDITS.toLocaleString("en-US")} ${v.sponsor} credits each` : "every week",
      bonus: bonus(v),
      who,
    },
    weeks: Object.values(FEATURED_ROTATION).map((a, i) => ({
      label: `Week ${i + 1}`,
      dates: WEEK_DATES[i],
      double: `2× ${FEATURED_NAME[a]}`,
      current: v.phase === "prize" && v.week?.number === i + 1,
    })),
    fair: {
      line: "Caps, alts and new accounts are checked on our servers.",
      report: { label: "Report →", href: REPORT_URL },
    },
  };
}
