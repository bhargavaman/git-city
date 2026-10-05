import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { RIVALRY } from "@/lib/towns/rivalry";
import { getPlayRules } from "@/lib/towns/play-rules-server";
import { RULES_META, rulesCopy } from "./copy";
import Countdown from "./Countdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: RULES_META.title,
  description: RULES_META.description,
  openGraph: { title: RULES_META.title, description: RULES_META.description, siteName: "Git City", type: "website" },
};

const LINK = "inline-flex min-h-11 items-center";
const SIDE_RE = new RegExp(`(${RIVALRY.map((s) => s.name).join("|")})`);

/** Colors the side names in a live line with their town colors. */
function Named({ text }: { text: string }) {
  return (
    <>
      {text.split(SIDE_RE).map((part, i) => {
        const side = RIVALRY.find((s) => s.name === part);
        return side ? (
          <span key={i} style={{ color: side.color }}>
            {part}
          </span>
        ) : (
          part
        );
      })}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-14 border-t-[3px] border-border pt-10">
      <h2 className="text-2xl text-cream sm:text-3xl">{title}</h2>
      <div className="mt-6 flex flex-col gap-3 text-sm leading-relaxed normal-case">{children}</div>
    </section>
  );
}

// /towns/rules: how you score, how a side wins, how you win a prize and how we
// check. Every number comes from play-rules.ts, the same file the scoring uses.
export default async function TownsRulesPage() {
  const t = rulesCopy(await getPlayRules());

  return (
    <main className="min-h-screen bg-bg pb-24 font-pixel uppercase text-warm">
      <nav className="mx-auto flex max-w-4xl items-center px-4 py-2 sm:px-6">
        <Link href="/towns" className={`${LINK} text-sm text-muted transition-colors hover:text-cream`}>
          {t.back}
        </Link>
      </nav>

      <div className="mx-auto max-w-4xl border-t-[3px] border-border px-4 pt-14 sm:px-6 sm:pt-20">
        <p className="text-xs tracking-widest text-muted sm:text-sm">{t.kicker}</p>
        <h1 className="mt-4 text-4xl text-cream sm:text-6xl">{t.title}</h1>
        <p className="mt-5 text-base text-lime normal-case sm:text-lg">{t.sub}</p>
        <div className="mt-3 flex flex-col gap-1 text-sm leading-relaxed text-cream normal-case">
          {t.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <p className="mt-6 inline-block border-[3px] border-border bg-bg-raised px-4 py-2 text-xs tracking-widest text-cream">
          {t.status.text}
          {t.status.endsAt !== null && (
            <>
              {" "}
              <Countdown endsAt={t.status.endsAt} />
            </>
          )}
        </p>

        <Section title={t.points.title}>
          {/* Desktop: 3 columns. Phone: label left, "1 pt · 200/day" right. */}
          <div className="hidden border-[3px] border-border bg-bg-raised sm:block">
            <div className="grid grid-cols-[1fr_6rem_10rem] border-b-[3px] border-border px-5 py-3 text-xs tracking-widest text-muted uppercase">
              {t.points.head.map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
            {t.points.rows.map((r) => (
              <div
                key={r.label}
                className="grid grid-cols-[1fr_6rem_10rem] items-baseline border-b-[3px] border-border px-5 py-3 last:border-b-0"
              >
                <span className="pr-4 text-cream">
                  {r.label}
                  {r.tag && <span className="ml-2 text-xs text-lime uppercase">{r.tag}</span>}
                </span>
                <span className={`tabular-nums ${r.tag ? "text-lime" : "text-cream"}`}>{r.pts}</span>
                <span className={`tabular-nums ${r.tag ? "text-lime" : "text-cream"}`}>{r.cap}</span>
              </div>
            ))}
          </div>
          <ul className="border-[3px] border-border bg-bg-raised sm:hidden">
            {t.points.rows.map((r) => (
              <li
                key={r.label}
                className="flex items-start justify-between gap-4 border-b-[3px] border-border px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1 text-cream">
                  {r.label}
                  {r.tag && <span className="mt-1 block text-xs text-lime uppercase">{r.tag}</span>}
                </span>
                <span className={`shrink-0 text-right text-xs tabular-nums ${r.tag ? "text-lime" : "text-cream"}`}>
                  {r.compact}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted">{t.points.note}</p>
        </Section>

        <Section title={t.double.title}>
          <p className="text-cream">{t.double.text}</p>
          {t.double.live && <p className="text-lime">{t.double.live}</p>}
        </Section>

        <Section title={t.bonus.title}>
          {t.bonus.paragraphs.map((p) => (
            <p key={p} className="text-cream">
              {p}
            </p>
          ))}
          <p className="text-muted">{t.bonus.formula}</p>
          {t.bonus.live && (
            <p className="text-lime">
              <Named text={t.bonus.live.text} />
            </p>
          )}
        </Section>

        <Section title={t.war.title}>
          <ol className="flex flex-col gap-4">
            {t.war.steps.map((step, i) => (
              <li key={step} className="flex gap-4 text-cream sm:text-base">
                <span className="w-6 shrink-0 text-lime">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <p className="pl-10 text-muted">{t.war.note}</p>
        </Section>

        <Section title={t.categories.title}>
          {t.categories.items.map((c) => (
            <p key={c.term} className="text-cream">
              <span className="text-lime">{c.term}:</span> {c.text}
            </p>
          ))}
          <p className="text-muted">{t.categories.note}</p>
        </Section>

        <Section title={t.prize.title}>
          {t.prize.lines.map((line, i) => (
            <p key={line} className={i === 0 ? "text-base text-cream" : "text-cream"}>
              {line}
            </p>
          ))}
        </Section>

        <Section title={t.who.title}>
          <ul className="flex flex-col gap-2 text-muted">
            {t.who.items.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true">-</span>
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t.checks.title}>
          <p className="text-cream">{t.checks.intro}</p>
          <dl className="border-[3px] border-border bg-bg-raised">
            {t.checks.rows.map((r) => (
              <div
                key={r.term}
                className="grid gap-1 border-b-[3px] border-border px-4 py-4 last:border-b-0 sm:grid-cols-[10rem_1fr] sm:gap-4 sm:px-5"
              >
                <dt className="text-xs tracking-widest text-lime uppercase">{r.term}</dt>
                <dd className="text-cream">
                  {r.text}
                  {r.term === "Report" && (
                    <>
                      {" "}
                      <a
                        href={t.checks.report.href}
                        target="_blank"
                        rel="noreferrer"
                        className={`${LINK} text-lime underline underline-offset-4 hover:text-cream`}
                      >
                        {t.checks.report.label}
                      </a>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title={t.dates.title}>
          <div className="grid grid-cols-[5.5rem_7.5rem_1fr] gap-3 px-4 text-xs tracking-widest text-muted uppercase sm:grid-cols-[8rem_12rem_1fr] sm:px-5">
            {t.dates.head.map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {t.dates.rows.map((r) => (
              <div
                key={r.week}
                className={`grid grid-cols-[5.5rem_7.5rem_1fr] items-baseline gap-3 border-[3px] bg-bg-raised px-4 py-3 text-xs sm:text-sm sm:grid-cols-[8rem_12rem_1fr] sm:px-5 ${
                  r.current ? "border-lime" : "border-border"
                }`}
              >
                <span className={r.current ? "text-lime" : "text-cream"}>{r.week}</span>
                <span className="tabular-nums text-cream">{r.dates}</span>
                <span className="min-w-0 break-words text-cream">{r.double}</span>
              </div>
            ))}
          </div>
          {t.dates.notes.map((n) => (
            <p key={n} className="text-muted">
              {n}
            </p>
          ))}
        </Section>

        {t.sponsorLine && <p className="mt-14 text-sm text-muted normal-case">{t.sponsorLine}</p>}
      </div>
    </main>
  );
}
