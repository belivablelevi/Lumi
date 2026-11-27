import type { Metadata } from "next";
import { launches } from "@/content/launches";
import { listedProducts } from "@/lib/catalogue";
import { STATUS_LABEL } from "@/lib/product-state";
import { renderImage } from "@/lib/renders";
import { Hero } from "@/components/home/Hero";
import { ChooseCompanion } from "@/components/home/ChooseCompanion";
import { MakingWorkshop } from "@/components/home/MakingWorkshop";
import { PongSection } from "@/components/pong/PongSection";
import { Everyday } from "@/components/home/Everyday";
import { LaunchModule } from "@/components/home/LaunchModule";
import { BrandStory } from "@/components/home/BrandStory";
import { RollLumi } from "@/components/roll/RollLumi";
import { SectionHeading } from "@/components/ui/Section";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  const products = listedProducts();
  const pocket = products.find((p) => p.category === "pocket")!;
  const desk = products.find((p) => p.category === "desk");
  const launch = launches.find((l) => l.id === pocket.launchId) ?? launches[0]!;
  return (
    <>
      <Hero
        statusLabel={STATUS_LABEL[pocket.status]}
        units={[
          { persona: "yotos", image: renderImage("front-grey.png") },
          { persona: "ni", image: renderImage("front-milky-green.png") },
          { persona: "katos", image: renderImage("front-black.png") },
        ]}
      />

      <section aria-labelledby="meet-title" className="container-page py-12 lg:py-16">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <SectionHeading
            id="meet-title"
            eyebrow="Meet the Lumis"
            title="No two are quite alike."
            lead="Every Pocket Lumi gets its own eyes, sparkle and temperament at random, so which one you get is pure luck. Type a word and roll one."
          />
          <ButtonLink href="/shop" variant="outline" className="shrink-0">Shop all</ButtonLink>
        </div>
        <div className="mt-10">
          <RollLumi />
        </div>
      </section>

      <MakingWorkshop />
      <ChooseCompanion pocket={pocket} desk={desk} />
      <Everyday keyring={renderImage("on-keyring.png")} side={renderImage("usb-side.png")} />
      <PongSection />
      <LaunchModule launch={launch} />
      <BrandStory />
    </>
  );
}
