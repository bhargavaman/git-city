import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { RIVALRY } from "@/lib/towns/rivalry";
import { SIDES } from "@/lib/towns/battle-rules";
import { getPlayRules } from "@/lib/towns/play-rules-server";
import { RULES_META, rulesCopy } from "./copy";
import Countdown from "./Countdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: RULES_META.title,
  description: RULES_META.description,
  openGraph: { title: RULES_META.title, description: RULES_META.description, siteName: "Git City", type: "website" },
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col border-[3px] border-border bg-bg-card p-4 sm:p-5">
      <h2 className="text-xs text-muted">{title}</h2>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

// /towns/rules: three cards (play, win the week, win a prize), the four weeks
// and one line on fair play. Every number comes from play-rules.ts.
export default async function TownsRulesPage() {
  const t = rulesCopy(await getPlayRules());
  const [claude, codex] = RIVALRY;

  return (
    <main className="min-h-screen bg-bg pb-24 font-pixel uppercase text-warm">
      <nav className="mx-auto flex max-w-6xl items-center px-4 py-2 sm:px-6">
        <Link href="/towns" className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-cream">
          ← Towns
        </Link>
      </nav>

      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
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

        <div className="mt-8 grid gap-3 md:grid-cols-3 md:gap-4">
          <Card title={t.play.title}>
            <ul className="flex flex-col gap-3" aria-label="Points">
              {t.play.rows.map((r) => (
                <li key={r.activity} className="flex items-baseline gap-3 text-xs">
                  <span className="min-w-0 flex-1 text-cream normal-case">
                    {r.label}
                    {r.doubled && <span className="ml-2 text-lime">2×</span>}
                  </span>
                  <span className={`shrink-0 text-right tabular-nums ${r.doubled ? "text-lime" : "text-cream"}`}>{r.pts}</span>
                  <span className="w-14 shrink-0 text-right text-muted tabular-nums">{r.cap ?? ""}</span>
                </li>
              ))}
            </ul>
            <p className="mt-auto pt-4 text-xs text-muted normal-case">{t.play.note}</p>
          </Card>

          <Card title={t.war.title}>
            <p className="text-2xl leading-tight">
              <span style={{ color: claude.color }}>{claude.name}</span> <span className="text-dim">vs</span>{" "}
              <span style={{ color: codex.color }}>{codex.name}</span>
            </p>
            <ul className="mt-4 flex flex-col gap-2.5 text-xs text-cream normal-case">
              {t.war.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Card>

          <Card title={t.prize.title}>
            <p className="text-4xl leading-none text-lime">{t.prize.big}</p>
            <p className="mt-2 text-xs text-cream normal-case">{t.prize.sub}</p>
            <p
              className="mt-4 text-xs normal-case"
              style={{ color: t.prize.bonus.side ? RIVALRY[SIDES.indexOf(t.prize.bonus.side)].color : undefined }}
            >
              {t.prize.bonus.text}
            </p>
            <ul className="mt-auto flex flex-col gap-1.5 pt-4 text-xs text-muted normal-case">
              {t.prize.who.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Card>
        </div>

        <ol className="mt-3 grid grid-cols-2 gap-3 md:mt-4 md:grid-cols-4 md:gap-4">
          {t.weeks.map((w) => (
            <li key={w.label} className={`border-[3px] bg-bg-card px-4 py-3 text-xs ${w.current ? "border-lime" : "border-border"}`}>
              <p className={w.current ? "text-lime" : "text-muted"}>
                {w.label} · {w.dates}
              </p>
              <p className="mt-1.5 text-cream">{w.double}</p>
            </li>
          ))}
        </ol>

        <p className="mt-8 flex flex-wrap items-center gap-x-4 text-xs text-muted normal-case">
          {t.fair.line}
          <a
            href={t.fair.report.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center text-lime transition-colors hover:text-cream"
          >
            {t.fair.report.label}
          </a>
        </p>
      </div>
    </main>
  );
}
