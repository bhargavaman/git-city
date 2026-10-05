import { sendNotification, type NotificationPayload } from "../notifications";
import { mapWithConcurrency } from "../concurrency";
import { EMAIL_BASE_URL, button, heading, paragraph, textLink, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { isoDay, weekStart } from "../leagues/scoring";
import { BATTLE_START } from "../towns/rivalry";
import { battleWeekNumber } from "../towns/battle-rules";
import { PRIZE_CREDITS, PRIZE_DELIVERY, PRIZE_SPONSOR, PRIZE_WINNERS, RULES_PATH } from "../towns/play-rules";
import type { PlayEntry } from "../towns/play-score";

// The week's winners, once, after Sam's Monday check (/api/towns/play/publish).
// Three versions: sponsor + winners reply with their sponsor account email,
// sponsor + a code sent separately, or glory only (no sponsor). Git City never
// pays anything: the sponsor delivers its own credits.

export interface PrizeWinnerEmailData {
  week: number;
  sponsor: "Firecrawl" | null;
  delivery: "reply" | "code";
}

function prizeHeader(d: PrizeWinnerEmailData) {
  const credits = `${PRIZE_CREDITS.toLocaleString("en-US")} ${d.sponsor} credits`;
  const line = !d.sponsor
    ? `You're one of the ${PRIZE_WINNERS} players of week ${d.week} in Git City Towns. Your login is on /towns and in our Monday post.`
    : d.delivery === "reply"
      ? `You won ${credits} in Git City Towns. Reply with the email of your ${d.sponsor} account and we'll pass it on.`
      : `You won ${credits} in Git City Towns. Your code comes in a separate email.`;
  return { subject: `You won week ${d.week} of Git City Towns`, preheader: line, line };
}

export function renderPrizeWinnerEmail(d: PrizeWinnerEmailData, links: EmailLinks) {
  const { subject, preheader, line } = prizeHeader(d);
  const url = trackedUrl("/towns", "play_prize");
  const rulesUrl = trackedUrl(RULES_PATH, "play_prize");
  const reason = `You're getting this because you finished in the top ${PRIZE_WINNERS} of Git City Towns.`;
  const html = renderLayout({
    title: subject,
    preheader,
    body: [heading("You won week", String(d.week)), paragraph(line), button("See the board", url), textLink("How scoring and checks work", rulesUrl)].join("\n"),
    reason,
    links,
  });
  const text = renderText({ lines: [subject, "", line, "", `See the board: ${url}`, "", `How scoring and checks work: ${rulesUrl}`], reason, links });
  return { subject, preheader, html, text };
}

/**
 * Why the publish route must not run for `week`, or null when it may.
 * The practice week has no winners, and while a sponsor's winners reply with
 * their account email, the reply has to reach a real inbox.
 */
export function publishRefusal(
  week: string,
  opts: { replyTo: string | undefined; sponsor?: "Firecrawl" | null; delivery?: "reply" | "code" },
): { status: 400 | 500; error: string } | null {
  const { replyTo, sponsor = PRIZE_SPONSOR, delivery = PRIZE_DELIVERY } = opts;
  const noon = Date.parse(`${week}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || Number.isNaN(noon) || isoDay(weekStart(new Date(noon))) !== week) {
    return { status: 400, error: "week must be a Monday, YYYY-MM-DD" };
  }
  if (Date.parse(`${week}T00:00:00Z`) < BATTLE_START) return { status: 400, error: "The practice week has no winners" };
  if (sponsor && delivery === "reply" && !replyTo) return { status: 500, error: "Set PRIZE_REPLY_TO" };
  return null;
}

/** One email per winner. Deduped per developer and week, so a rerun never sends twice. */
export async function sendPrizeWinners(
  startDay: string,
  winners: Pick<PlayEntry, "developer_id" | "login">[],
): Promise<number> {
  const data: PrizeWinnerEmailData = { week: battleWeekNumber(startDay), sponsor: PRIZE_SPONSOR, delivery: PRIZE_DELIVERY };
  const { subject, preheader } = prizeHeader(data);
  const replyTo = PRIZE_DELIVERY === "reply" ? process.env.PRIZE_REPLY_TO || undefined : undefined;
  const payloads: NotificationPayload[] = winners.map((w) => ({
    type: "play_prize",
    category: "leagues",
    developerId: w.developer_id,
    dedupKey: `play_prize:${w.developer_id}:${startDay}`,
    title: subject,
    body: preheader,
    render: (links) => renderPrizeWinnerEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/towns`,
    priority: "high",
    forceSend: true,
    channels: ["email"],
    replyTo,
  }));
  // sendEmail throttles for Resend; 8 in flight like the battle emails.
  const settled = await mapWithConcurrency(payloads, 8, (p) => sendNotification(p));
  return settled.filter((r) => r.status === "fulfilled" && r.value.some((x) => x.success)).length;
}
