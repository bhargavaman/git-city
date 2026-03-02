import type { Metadata } from "next";
import Link from "next/link";
import PitchDeck from "./PitchDeck";

export const metadata: Metadata = {
  title: "Pitch Deck - Git City",
  description:
    "Git City: transforming GitHub profiles into an interactive 3D city. 11,800+ developers, organic growth, revenue from day one.",
};

export default function PitchPage() {
  return <PitchDeck />;
}
