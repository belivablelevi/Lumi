import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { brand } from "@/config/brand";
import { listedProducts, productBySlug } from "@/lib/catalogue";
import { confirmed, display } from "@/lib/placeholder";
import { persona } from "@/lib/lumi-frames";
import { personaStories } from "@/content/personas";
import { Gallery } from "@/components/product/Gallery";
import { PurchasePanel } from "@/components/product/PurchasePanel";
import { ExpressionCycler } from "@/components/product/ExpressionCycler";
import { CharacterCard } from "@/components/product/CharacterCard";
import { Accordion } from "@/components/ui/Accordion";
import { SectionHeading, Tbc } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { OledScreen } from "@/components/lumi/OledScreen";
import { renderImage } from "@/lib/renders";

export function generateStaticParams() {
  return listedProducts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const p = productBySlug((await params).slug);
  if (!p) return {};
  return {
    title: p.name,
    description: p.tagline,
    openGraph: p.images[0] ? { images: [p.images[0].src] } : undefined,
  };
}

const GENES = [
  ["Eye shape", "8 shapes, from round and pill to droopy and almond"],
  ["Eye size", "5 sizes"],
  ["Spacing", "5 spacings, from close-set to far apart"],
  ["Height", "Eyes sit high, middle or low"],
  ["Glint", "6 highlight styles: square, dot, double, star, ring or none"],
  ["Accent", "Lashes, brows, freckles, blush, a beauty mark, or nothing"],
  ["Temperament", "Cheerful, sleepy, shy, grumpy or hyper"],
] as const;

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = productBySlug(slug);
  if (!product) notFound();
  const price = confirmed(product.price);
  const pocket = product.category === "pocket";
  const terms = confirmed(product.preorder);
  const included = confirmed(product.included);
  const jsonLd = price
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.tagline,
        image: product.images.map((i) => new URL(i.src, brand.siteUrl).toString()),
        sku: product.sku,
        brand: { "@type": "Brand", name: brand.name },
        offers: {
          "@type": "Offer",
          priceCurrency: price.currency,
          price: (price.amount / 100).toFixed(2),
          availability: product.status === "preorder" ? "https://schema.org/PreOrder" : product.status === "available" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        },
      }
    : null;

  return (
    <>
      {jsonLd && !product.demo ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /> : null}
      <section className="container-page grid gap-10 pt-6 pb-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-10">
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          {product.images.length ? (
            <Gallery images={product.images} personaId={product.personas[0]} name={product.name} />
          ) : (
            <div className="grid aspect-square place-items-center rounded-panel bg-night p-10">
              <div className="w-full max-w-sm">
                <div className="aspect-[2/1] rounded-[18px] bg-black p-3 ring-1 ring-white/10">
                  <OledScreen src={persona(product.personas[0] ?? "ni").animations.nod_off!.file} label="A Lumi face" />
                </div>
                <p className="mt-4 text-center text-sm text-white/55">No pictures yet: {product.name} is still being designed.</p>
              </div>
            </div>
          )}
        </div>
        <PurchasePanel product={product} />
      </section>

      <section className="container-page py-12 lg:py-16" aria-labelledby="meet-title">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
          <SectionHeading id="meet-title" eyebrow="The character" title={`Meet ${product.name}`} />
          <div className="space-y-4 text-lead text-ink-soft">
            {product.description.map((d) => <p key={d}>{d}</p>)}
          </div>
        </div>
      </section>

      {pocket ? (
        <>
          <section className="bg-white py-16 lg:py-20" aria-labelledby="own-title">
            <div className="container-page">
              <SectionHeading id="own-title" eyebrow="A personality all its own" title="Every Lumi is one of a kind."
                lead="When a Lumi is made, its traits are picked at random from 108,000 combinations, and no two units are the same. Rarer traits come up less often, so a legendary Lumi is a lucky find." />
              <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.4fr]">
                <dl className="self-start divide-y divide-line rounded-card bg-cloud ring-1 ring-line">
                  {GENES.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[7rem_1fr] gap-4 px-5 py-3.5 text-[0.9375rem]">
                      <dt className="font-bold">{k}</dt>
                      <dd className="text-muted">{v}</dd>
                    </div>
                  ))}
                  <div className="grid grid-cols-[7rem_1fr] gap-4 px-5 py-3.5 text-[0.9375rem]">
                    <dt className="font-bold">Rarity</dt>
                    <dd className="text-muted">About 60% of units are common, 25% uncommon, 12% rare and 3% legendary.</dd>
                  </div>
                </dl>
                <div className="grid gap-4 sm:grid-cols-2">
                  {personaStories.map((s, i) => (
                    <Reveal key={s.id} delay={i * 0.05}>
                      <CharacterCard personaId={s.id} line={s.line} shell={s.shell} image={renderImage(s.render)} product={product} />
                    </Reveal>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="container-page py-16 lg:py-20" aria-labelledby="action-title">
            <SectionHeading id="action-title" eyebrow="See it in action" title="Twenty-nine faces, one personality." className="mb-10" />
            <ExpressionCycler personaIds={product.personas} />
          </section>
        </>
      ) : null}

      <section className="container-page grid gap-6 py-12 lg:grid-cols-2 lg:py-16" aria-label="Details">
        {product.specs.length ? (
          <div>
            <h2 className="text-h2 font-bold">Specifications</h2>
            {product.specsNote ? <p className="mt-3 text-sm text-muted">{product.specsNote}</p> : null}
            <dl className="mt-6 divide-y divide-line rounded-card bg-white ring-1 ring-line">
              {product.specs.map((s) => (
                <div key={s.label} className="grid grid-cols-[8rem_1fr] gap-4 px-5 py-3.5 text-[0.9375rem]">
                  <dt className="font-bold">{s.label}</dt>
                  <dd className={confirmed(s.value) ? "text-ink-soft" : ""}>{confirmed(s.value) ?? <Tbc />}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        <div className="space-y-6">
          <div className="rounded-card bg-white p-6 ring-1 ring-line">
            <h2 className="text-h3 font-bold">What&apos;s included</h2>
            {included ? <ul className="mt-3 list-disc pl-5 text-ink-soft">{included.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-2"><Tbc /></p>}
          </div>
          <div className="rounded-card bg-white p-6 ring-1 ring-line">
            <h2 className="text-h3 font-bold">Pre-order information</h2>
            {terms ? (
              <dl className="mt-3 space-y-2 text-ink-soft">
                <div><dt className="font-bold text-ink">Dispatch window</dt><dd>{terms.dispatchWindow}</dd></div>
                <div><dt className="font-bold text-ink">When you pay</dt><dd>{terms.paymentTiming}</dd></div>
                <div><dt className="font-bold text-ink">Cancelling</dt><dd>{terms.cancellation}</dd></div>
                <div><dt className="font-bold text-ink">If the launch is delayed</dt><dd>{terms.delays}</dd></div>
              </dl>
            ) : (
              <p className="mt-2 text-muted">Pre-orders aren&apos;t open. The dispatch window, payment timing and cancellation terms will be published here before they are.</p>
            )}
          </div>
          <div className="rounded-card bg-white p-6 ring-1 ring-line">
            <h2 className="text-h3 font-bold">Shipping and returns</h2>
            <p className="mt-2 text-muted">{display(product.shipping)}. See <a className="underline" href="/shipping-returns">shipping and returns</a>.</p>
          </div>
        </div>
      </section>

      {product.faq.length ? (
        <section className="container-page py-12 lg:py-16" aria-labelledby="faq-title">
          <h2 id="faq-title" className="text-h2 font-bold">Questions</h2>
          <div className="mt-6 max-w-3xl">
            <Accordion items={product.faq.map((f) => ({ q: f.q, a: confirmed(f.a) ?? <Tbc>We&apos;ll answer this once it&apos;s confirmed.</Tbc> }))} />
          </div>
        </section>
      ) : null}
    </>
  );
}
