import { sendNotification, type NotificationPayload } from "../notifications";
import { mapWithConcurrency } from "../concurrency";
import { EMAIL_BASE_URL, button, heading, paragraph, textLink, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { isoDay, weekStart } from "../leagues/scoring";
import { BATTLE_START } from "../towns/rivalry";
import { battleWeekNumber } from "../towns/battle-rules";
import { PRIZE_CREDITS, PRIZE_DELIVERY, PRIZE_SPONSOR, PRIZE_WINNERS, RULES_PATH } from "../towns/play-rules";
import type { PlayEntry } from "../towns/play-score";

// The week's winners, once, from the Monday close (play-publish.ts). Three
// versions: sponsor + the winner's coupon in the email, sponsor + winners reply
// with their sponsor account email, or glory only (no sponsor). Git City never
// pays anything: the sponsor delivers its own credits.

export interface PrizeWinnerEmailData {
  week: number;
  sponsor: "Firecrawl" | null;
  delivery: "reply" | "code";
  /** The week's coupon (a code, or a link), for "code" delivery. */
  code?: string | null;
}

/** Firecrawl's coupons page; it opens on the signed-in user's own team. */
const SPONSOR_URL = "https://www.firecrawl.dev/app/settings?tab=billing&view=coupons";
const isLink = (code: string) => /^https?:\/\//i.test(code);

function prizeHeader(d: PrizeWinnerEmailData) {
  const credits = `${PRIZE_CREDITS.toLocaleString("en-US")} ${d.sponsor} credits`;
  const line = !d.sponsor
    ? `You're one of the ${PRIZE_WINNERS} players of week ${d.week} in Git City Towns. Your login is on /towns and in our Monday post.`
    : d.delivery === "reply"
      ? `You won ${credits} in Git City Towns. Reply with the email of your ${d.sponsor} account and we'll pass it on.`
      : `You won ${credits} in Git City Towns.`;
  return { subject: `You won week ${d.week} of Git City Towns`, preheader: line, line };
}

export function renderPrizeWinnerEmail(d: PrizeWinnerEmailData, links: EmailLinks) {
  const { subject, preheader, line } = prizeHeader(d);
  const url = trackedUrl("/towns", "play_prize");
  const rulesUrl = trackedUrl(RULES_PATH, "play_prize");
  const reason = `You're getting this because you finished in the top ${PRIZE_WINNERS} of Git City Towns.`;
  // With a coupon: a link becomes the button, a code is printed under the line.
  const code = d.sponsor && d.delivery === "code" ? (d.code ?? null) : null;
  const claim = code && isLink(code) ? code : null;
  const body = [
    heading("You won week", String(d.week)),
    paragraph(line),
    ...(code && !claim ? [paragraph(`Your code: ${code}`)] : []),
    claim ? button("Claim your credits", claim) : code ? button("Redeem your credits", SPONSOR_URL) : button("See the board", url),
    ...(code ? [textLink("See the board", url)] : []),
    textLink("How scoring and checks work", rulesUrl),
  ];
  const html = renderLayout({ title: subject, preheader, body: body.join("\n"), reason, links });
  const text = renderText({
    lines: [
      subject,
      "",
      line,
      ...(code ? ["", claim ? `Claim your credits: ${claim}` : `Your code: ${code}`, ...(claim ? [] : [`Redeem your credits: ${SPONSOR_URL}`])] : []),
      "",
      `See the board: ${url}`,
      "",
      `How scoring and checks work: ${rulesUrl}`,
    ],
    reason,
    links,
  });
  return { subject, preheader, html, text };
}

/** The week's coupon from PRIZE_CODES ("W1,W2,W3,W4", week 1 = BATTLE_START), or null. */
export function weekCode(raw: string | undefined, week: string): string | null {
  const codes = (raw ?? "").split(",").map((c) => c.trim());
  const code = codes[battleWeekNumber(week) - 1];
  return code ? code : null;
}

/**
 * Why the publish route must not run for `week`, or null when it may.
 * A week before the season has no winners, and while a sponsor's winners reply with
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
  if (Date.parse(`${week}T00:00:00Z`) < BATTLE_START) return { status: 400, error: "Before the first week" };
  if (sponsor && delivery === "reply" && !replyTo) return { status: 500, error: "Set PRIZE_REPLY_TO" };
  return null;
}

/**
 * One email per winner. Deduped per developer and week, so a rerun never sends
 * twice. With "code" delivery a winner without a coupon gets no email yet (a
 * rerun sends it once codes are loaded), so nobody is told "you won" empty-handed.
 */
export async function sendPrizeWinners(
  startDay: string,
  winners: (Pick<PlayEntry, "developer_id" | "login"> & { code?: string | null })[],
): Promise<number> {
  const week = battleWeekNumber(startDay);
  const base: PrizeWinnerEmailData = { week, sponsor: PRIZE_SPONSOR, delivery: PRIZE_DELIVERY };
  const { subject, preheader } = prizeHeader(base);
  const replyTo = PRIZE_DELIVERY === "reply" ? process.env.PRIZE_REPLY_TO || undefined : undefined;
  const needsCode = PRIZE_SPONSOR !== null && PRIZE_DELIVERY === "code";
  const ready = needsCode ? winners.filter((w) => w.code) : winners;
  if (ready.length < winners.length) console.error(`[towns-prize] ${winners.length - ready.length} winners of ${startDay} have no code yet`);
  const payloads: NotificationPayload[] = ready.map((w) => ({
    type: "play_prize",
    category: "leagues",
    developerId: w.developer_id,
    dedupKey: `play_prize:${w.developer_id}:${startDay}`,
    title: subject,
    body: preheader,
    render: (links) => renderPrizeWinnerEmail({ ...base, code: w.code ?? null }, links),
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
