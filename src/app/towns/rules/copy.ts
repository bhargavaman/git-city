import { BATTLE_START_LABEL, RIVALRY } from "@/lib/towns/rivalry";
import { SIDES } from "@/lib/towns/battle-rules";
import {
  ACCOUNT_CUTOFF_LABEL,
  FEATURED_ROTATION,
  PRIZE_CREDITS,
  PRIZE_WINNERS,
  REPORT_URL,
  SEASON_WEEKS,
  capFor,
  type FeaturedActivity,
} from "@/lib/towns/play-rules";
import type { PlayRulesView } from "@/lib/towns/play-rules-view";

// English only: the Portuguese lives in Sam's posts, not on the site.

export const RULES_META = {
  title: "Towns rules - Git City",
  description: "How points, the war, the prize and the checks work in Git City Towns.",
};

const FEATURED_NAME: Record<FeaturedActivity, string> = {
  floors: "Floors",
  raids: "Raids",
  visits: "Visits",
  kudos: "Kudos",
};

/** Short dates for the 4 prize weeks, in FEATURED_ROTATION order. */
const WEEK_DATES = ["Oct 19–25", "Oct 26 – Nov 1", "Nov 2–8", "Nov 9–15"];

const sideName = (side: (typeof SIDES)[number]) => RIVALRY[SIDES.indexOf(side)].name;

export interface RulesCopy {
  back: string;
  kicker: string;
  title: string;
  sub: string;
  lines: string[];
  status: { text: string; endsAt: number | null };
  points: {
    title: string;
    head: [string, string, string];
    rows: { label: string; pts: string; cap: string; tag: string | null; compact: string }[];
    note: string;
  };
  double: { title: string; text: string; live: string | null };
  bonus: { title: string; paragraphs: string[]; formula: string; live: { text: string } | null };
  war: { title: string; steps: string[]; note: string };
  categories: { title: string; items: { term: string; text: string }[]; note: string };
  prize: { title: string; lines: string[] };
  who: { title: string; items: string[] };
  checks: {
    title: string;
    intro: string;
    rows: { term: string; text: string }[];
    report: { label: string; href: string };
  };
  dates: {
    title: string;
    head: [string, string, string];
    rows: { week: string; dates: string; double: string; current: boolean }[];
    notes: string[];
  };
  sponsorLine: string | null;
}

function status(v: PlayRulesView): RulesCopy["status"] {
  if (v.phase === "before") return { text: `Practice week starts Mon, Oct 12 · Prizes start ${BATTLE_START_LABEL}`, endsAt: null };
  if (v.phase === "practice") return { text: `Practice week · nothing at stake · Prizes start ${BATTLE_START_LABEL}`, endsAt: null };
  if (v.phase === "prize" && v.week) return { text: `Week ${v.week.number} of ${SEASON_WEEKS} · ends in`, endsAt: v.week.endsAt };
  // phase "ended"
  return { text: "This season ended Nov 15.", endsAt: null };
}

function bonusLive(v: PlayRulesView): RulesCopy["bonus"]["live"] {
  if (v.phase === "ended") return null;
  if (v.bonus.state === "smaller") {
    const name = sideName(v.bonus.side);
    return { text: `This week: ${name} is smaller, so ${name} players get +${v.bonus.pct}% prize points.` };
  }
  if (v.bonus.state === "even") return { text: "This week: the sides are even. No bonus." };
  return { text: `The first bonus is set ${BATTLE_START_LABEL}.` };
}

function doubleLive(v: PlayRulesView): string | null {
  if (v.phase === "practice") return "Nothing counts double in the practice week.";
  if (v.phase === "prize" && v.featured) return `This week: ${FEATURED_NAME[v.featured]}.`;
  return null;
}

function prizeLines(v: PlayRulesView): string[] {
  const lines = [
    v.sponsor
      ? `The ${PRIZE_WINNERS} players with the most points each week win ${PRIZE_CREDITS.toLocaleString("en-US")} ${v.sponsor} credits each.`
      : `The ${PRIZE_WINNERS} players with the most points each week are named on /towns and in our Monday post.`,
    "Points here include the smaller-side bonus. Ties go to more days played, then to whoever joined Git City first.",
  ];
  if (v.onePrizePerSeason)
    lines.push(`One prize per player across the ${SEASON_WEEKS} weeks. Past winners still rank and still count for their side.`);
  if (v.sponsor)
    lines.push(
      v.delivery === "reply"
        ? `We email winners after the Monday check. Reply with the email of your ${v.sponsor} account and we pass it on.`
        : "We email each winner a code after the Monday check.",
    );
  return lines;
}

function dateRows(v: PlayRulesView): RulesCopy["dates"]["rows"] {
  const prizeWeeks = Object.values(FEATURED_ROTATION).map((a, i) => ({
    week: String(i + 1),
    dates: WEEK_DATES[i],
    double: FEATURED_NAME[a],
    current: v.phase === "prize" && v.week?.number === i + 1,
  }));
  return [
    { week: "Practice", dates: "Oct 12–18", double: "none, nothing at stake", current: v.phase === "practice" },
    ...prizeWeeks,
  ];
}

export function rulesCopy(v: PlayRulesView): RulesCopy {
  const plus = `+${v.teamBonus}`;
  return {
    back: "← Towns",
    kicker: "Git City Towns",
    title: "Rules",
    sub: "Everything you do in Git City scores, with a daily cap. The side with the most points per player wins.",
    lines: ["The smaller side gets bonus prize points.", "One activity counts double each week."],
    status: status(v),
    points: {
      title: "Points",
      head: ["What you do", "Points", "Daily cap"],
      rows: v.activities.map((a) => {
        const cap = capFor(a.key, v.featured);
        return {
          // a.label is already the string from ACTIVITY_COPY[key].label (see rulesView).
          label: a.label,
          pts: String(a.pts),
          cap: a.capNote,
          tag: a.doubled ? "2× this week" : null,
          compact: `${a.pts} ${a.pts === 1 ? "pt" : "pts"} · ${cap}/day`,
        };
      }),
      note: "Days reset at midnight UTC. Drift, fly, race and Crown Rush don't score.",
    },
    double: {
      title: "One activity counts double",
      text: "Each week one activity is worth 2× points, with a 2× daily cap. It counts for everyone, for the war and the prize.",
      live: doubleLive(v),
    },
    bonus: {
      title: "Smaller-side bonus",
      paragraphs: [
        "Each Monday we compare the two sides' sizes. Players on the smaller side get extra prize points: the bigger the gap, the bigger the bonus, up to +20%. Equal sides get nothing.",
        "Example: 50 players against 19 gives +16%.",
        "It counts for the prize only. It never changes a side's score in the war, because that score is already an average per player.",
        "Sides are counted at the start of each week, with only the players who pass the account checks below. Players outside Claude and Codex get no bonus.",
      ],
      formula: "Bonus = (bigger side − smaller side) ÷ bigger side × 25, rounded, max 20%. Bonus points are rounded down.",
      live: bonusLive(v),
    },
    war: {
      title: "How a side wins the week",
      steps: [
        "Each side's score is the average points of its players who scored that week.",
        "A side needs at least 3 players who scored, or it has no score that week.",
        `Each team category a side wins adds ${plus} to its score.`,
        "The higher score wins the week. A tie goes to nobody.",
      ],
      note: "Players in other towns score for the prize, not for a side. You can switch sides on Mondays only.",
    },
    categories: {
      title: "Team categories",
      items: [
        {
          term: "Grew the most",
          text:
            v.growthBy === "share"
              ? `${plus} to the side whose town grew the most for its size that week. Rejoining your town or switching sides doesn't count.`
              : `${plus} to the side whose town gained the most new members that week. Rejoining your town or switching sides doesn't count.`,
        },
        {
          term: "Most visited",
          text: `${plus} to the side whose town had the most visitors from other towns. Claude and Codex players don't count as visitors. Each visitor counts once a day, and the town needs at least 5 different visitors.`,
        },
      ],
      note: "A tie gives nobody the bonus. A side with no score can't win one. Only players who pass the account checks count.",
    },
    prize: { title: "The prize", lines: prizeLines(v) },
    who: {
      title: "Who can win",
      items: [
        "You're an active member of any town.",
        `Your GitHub account was created before ${ACCOUNT_CUTOFF_LABEL}.`,
        "Your building was claimed before the week started (Monday 00:00 UTC).",
        "You scored at least 1 point that week from something other than coding.",
        "One prize per person, even if you have several accounts.",
      ],
    },
    checks: {
      title: "How we check",
      intro: "Points are counted on our servers, not in your browser. Here is what we check.",
      rows: [
        { term: "Floors", text: "Counted by the game server. Your own town's buildings and shielded buildings give 0. Moves faster than a car can drive are flagged." },
        { term: "Raids", text: "Run on our server. 3 a day, and the same building once a week." },
        { term: "Visits", text: "One per town per day. Your own town doesn't count." },
        { term: "Kudos", text: "5 a day, never to yourself." },
        { term: "Coding", text: "Read from GitHub every hour. The top 30 are checked again when the week closes." },
        { term: "Daily caps", text: "Once you hit an activity's cap, it stops scoring until midnight UTC. A bot that plays all day can only tie a person who plays a few minutes." },
        { term: "Accounts", text: "New accounts, buildings claimed mid-week and extra accounts of the same person count for no side and no prize. They still show on the board." },
        { term: "Every Monday", text: "At 00:05 UTC the week freezes. Before winners are published, a person checks the top 15 by hand. An account that broke the rules is removed and the next player moves up. The war result stays as it froze." },
        { term: "In public", text: "Winners' GitHub logins are listed on /towns and posted on X every Monday. Nothing else about you is published." },
        { term: "Report", text: "See something off? Open a public issue on GitHub with the login and what you saw. We answer there. Please don't send DMs." },
      ],
      report: { label: "Open an issue on GitHub", href: REPORT_URL },
    },
    dates: {
      title: "Dates",
      head: ["Week", "Dates", "Counts double"],
      rows: dateRows(v),
      notes: [
        "Weeks run Monday to Sunday, UTC. Winners are posted the Monday after, once the check is done.",
        "Fri, Nov 13: raids are unlimited. Raid points still stop at 30 a day.",
      ],
    },
    sponsorLine: v.sponsor ? `Prizes by ${v.sponsor}.` : null,
  };
}
