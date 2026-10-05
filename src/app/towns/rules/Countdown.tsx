"use client";

import { useEffect, useState } from "react";
import { timeUntil } from "@/lib/towns/rivalry";

/** "3d 4h" to the end of the week, ticking every 30 s. Shows "…" until mounted (no hydration mismatch). */
export default function Countdown({ endsAt }: { endsAt: number }) {
  const [left, setLeft] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setLeft(timeUntil(endsAt, Date.now()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [endsAt]);
  return <span className="text-lime tabular-nums">{left ?? "…"}</span>;
}
