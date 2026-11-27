import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { RollLumi } from "@/components/roll/RollLumi";

export const metadata: Metadata = {
  title: "Roll a Lumi",
  description: "Type any word and see which Lumi the dice would roll: its eyes, glint, accent, temperament and rarity.",
  alternates: { canonical: "/roll" },
};

export default function RollPage() {
  return (
    <>
      <PageHeader
        eyebrow="Roll a Lumi"
        title="Which Lumi would you roll?"
        lead="Every Lumi's chip decides its eyes, glint, accent and temperament. Type a word and watch the dice land. Nothing is saved or sent anywhere."
      />
      <div className="container-page pb-8">
        <RollLumi />
        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted">
          This uses the same code that decides a real Lumi.{" "}
          <Link href="/how-its-made#dice" className="underline">How a Lumi is made</Link>
          {" · "}
          <Link href="/products/pocket-lumi#odds-title" className="underline">Every chance, in full</Link>
        </p>
      </div>
    </>
  );
}
