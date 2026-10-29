import { launches } from "@/content/launches";
import { personaStories } from "@/content/personas";
import { listedProducts } from "@/lib/catalogue";
import { STATUS_LABEL } from "@/lib/product-state";
import { renderImage } from "@/lib/renders";
import { Hero } from "@/components/home/Hero";
import { ChooseCompanion } from "@/components/home/ChooseCompanion";
import { PersonalityShowcase } from "@/components/home/PersonalityShowcase";
import { Everyday } from "@/components/home/Everyday";
import { LaunchModule } from "@/components/home/LaunchModule";
import { BrandStory } from "@/components/home/BrandStory";
import { CharacterCard } from "@/components/product/CharacterCard";
import { SectionHeading } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { ButtonLink } from "@/components/ui/Button";

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
          { persona: "yotos", image: renderImage("front-lavender.png") },
          { persona: "ni", image: renderImage("front-mint.png") },
          { persona: "katos", image: renderImage("front-peach.png") },
        ]}
      />

      <section aria-labelledby="meet-title" className="container-page py-16 lg:py-20">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <SectionHeading
            id="meet-title"
            eyebrow="Meet the Lumis"
            title="No two are quite alike."
            lead="Every Pocket Lumi is made with its own eyes, sparkle and temperament. Here are a few we made earlier."
          />
          <ButtonLink href="/shop" variant="outline" className="shrink-0">Shop all</ButtonLink>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {personaStories.map((s, i) => (
            <Reveal key={s.id} delay={i * 0.06}>
              <CharacterCard personaId={s.id} line={s.line} shell={s.shell} image={renderImage(s.render)} product={pocket} />
            </Reveal>
          ))}
        </div>
        <p className="mt-5 text-sm text-muted">
          These are example units. Yours will be one of a kind, with its own look and temperament.
        </p>
      </section>

      <ChooseCompanion pocket={pocket} desk={desk} />
      <PersonalityShowcase />
      <Everyday keyring={renderImage("on-keyring.png")} side={renderImage("usb-side.png")} />
      <LaunchModule launch={launch} />
      <BrandStory />
    </>
  );
}
