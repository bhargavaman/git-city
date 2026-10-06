import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { RIVALRY } from "@/lib/towns/rivalry";
import { SIDES } from "@/lib/towns/battle-rules";
import { getPlayRules } from "@/lib/towns/play-rules-server";
import ScoreCard from "@/components/towns/ScoreCard";
import { RULES_META, rulesCopy } from "./copy";
import Countdown from "./Countdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: RULES_META.title,
  description: RULES_META.description,
  openGraph: { title: RULES_META.title, description: RULES_META.description, siteName: "Git City", type: "website" },
};

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-lg text-cream sm:text-xl">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// /towns/rules: the score card, this week's 2× and bonus, then how a side
// wins, the prize, fair play and the dates. Same cards as /towns; every
// number comes from play-rules.ts.
export default async function TownsRulesPage() {
  const v = await getPlayRules();
  const t = rulesCopy(v);

  return (
    <main className="min-h-screen bg-bg pb-24 font-pixel uppercase text-warm">
      <nav className="mx-auto flex max-w-4xl items-center px-4 py-2 sm:px-6">
        <Link href="/towns" className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-cream">
          ← Towns
        </Link>
      </nav>

      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-4xl text-cream sm:text-5xl">Rules</h1>
          <p className="border-[3px] border-border bg-bg-raised px-3 py-2 text-xs text-cream">
            {t.status.text}
            {t.status.endsAt !== null && (
              <>
                {" "}
                <Countdown endsAt={t.status.endsAt} />
              </>
            )}
          </p>
        </div>

        <div className={`mt-8 grid gap-3 md:gap-6 ${t.tiles ? "md:grid-cols-[3fr_2fr]" : ""}`}>
          <ScoreCard featured={v.featured} note={t.scoreNote} />
          {t.tiles && (
            <div className="grid gap-3 md:gap-6">
              {t.tiles.map((tile) => (
                <div key={tile.big} className="flex flex-col justify-center border-[3px] border-border bg-bg-card p-4">
                  <p className="text-2xl sm:text-3xl" style={{ color: tile.side ? RIVALRY[SIDES.indexOf(tile.side)].color : "var(--color-lime)" }}>
                    {tile.big}
                  </p>
                  <p className="mt-2 text-xs text-muted normal-case">{tile.sub}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <Block title={t.war.title}>
          <ol className="flex flex-col gap-3">
            {t.war.steps.map((step, i) => (
              <li key={step} className="flex gap-4 text-sm text-cream normal-case">
                <span className="w-4 shrink-0 text-lime">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </Block>

        <Block title={t.prize.title}>
          <p className="text-sm text-cream normal-case">{t.prize.lead}</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-muted normal-case">
            {t.prize.who.map((w) => (
              <li key={w} className="flex gap-3">
                <span aria-hidden="true">-</span>
                {w}
              </li>
            ))}
          </ul>
        </Block>

        <Block title={t.fair.title}>
          <div className="flex flex-col gap-2 text-sm text-cream normal-case">
            {t.fair.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
          <a
            href={t.fair.report.href}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex min-h-11 items-center text-sm text-lime normal-case underline underline-offset-4 hover:text-cream"
          >
            {t.fair.report.label}
          </a>
        </Block>

        <Block title={t.dates.title}>
          <div className="border-[3px] border-border bg-bg-card">
            {t.dates.rows.map((r) => (
              <div
                key={r.week}
                className={`grid grid-cols-[5.5rem_1fr_auto] items-baseline gap-3 border-b-[3px] border-border px-3 py-3 text-xs last:border-b-0 sm:grid-cols-[8rem_1fr_auto] sm:px-4 ${
                  r.current ? "text-lime" : "text-cream"
                }`}
              >
                <span>{r.week}</span>
                <span className="tabular-nums">{r.dates}</span>
                <span className={`text-right ${r.current ? "" : "text-muted"}`}>{r.double}</span>
              </div>
            ))}
          </div>
        </Block>
      </div>
    </main>
  );
}
