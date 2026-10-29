import { ButtonLink } from "../ui/Button";
import { Reveal } from "../ui/Reveal";

export function BrandStory() {
  return (
    <section aria-labelledby="story-title" className="container-page py-16 lg:py-24">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="eyebrow">Our world</p>
        <h2 id="story-title" className="mt-3 text-h1 font-extrabold">
          Tiny faces, real feelings, <span className="text-lavender-deep">everyday moments.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lead text-muted">
          Lumi is built on a simple idea: the things we carry every day could have a little more character. A face that
          notices when you pick it up, sulks when you shake it, and falls asleep when you leave it be. No apps to open,
          no feeds to scroll. Just a small companion with a personality of its own.
        </p>
        <ButtonLink href="/our-world" variant="outline" className="mt-8">More about Lumi</ButtonLink>
      </Reveal>
    </section>
  );
}
