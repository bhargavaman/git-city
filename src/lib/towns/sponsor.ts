import { PRIZE_SPONSOR } from "./play-rules";

// The war's presenting sponsor, as every surface shows it: "presented by" and
// the sponsor's own wordmark (from their brand page), linking to their site.
// Null while the war has no sponsor. Client-safe.

export interface Sponsor {
  name: string;
  url: string;
  /** Wordmark for dark backgrounds, SVG, for the site. */
  wordmark: string;
  /** The same wordmark as a PNG (172×40), for emails and share images. */
  wordmarkPng: string;
  /** Width over height. */
  ratio: number;
}

const SPONSORS: Record<NonNullable<typeof PRIZE_SPONSOR>, Sponsor> = {
  Firecrawl: {
    name: "Firecrawl",
    url: "https://www.firecrawl.dev",
    wordmark: "/sponsors/firecrawl-wordmark.svg",
    wordmarkPng: "/email/firecrawl-wordmark.png",
    ratio: 172 / 40,
  },
};

export const SPONSOR: Sponsor | null = PRIZE_SPONSOR ? SPONSORS[PRIZE_SPONSOR] : null;
