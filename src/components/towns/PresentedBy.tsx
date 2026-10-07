import { SPONSOR } from "@/lib/towns/sponsor";

/** "presented by" and the sponsor's wordmark, linking to their site. Nothing without a sponsor. */
export default function PresentedBy({ height = 18, className = "" }: { height?: number; className?: string }) {
  if (!SPONSOR) return null;
  return (
    <a
      href={SPONSOR.url}
      target="_blank"
      rel="noopener sponsored"
      className={`inline-flex min-h-11 items-center gap-2.5 text-xs text-muted normal-case transition-opacity hover:opacity-80 ${className}`}
    >
      presented by
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed SVG wordmark */}
      <img src={SPONSOR.wordmark} alt={SPONSOR.name} height={height} width={Math.round(height * SPONSOR.ratio)} />
    </a>
  );
}
