import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { brand } from "@/config/brand";
import { confirmed } from "@/lib/placeholder";

export const metadata: Metadata = { title: "Privacy Policy" };

const LAST_UPDATED = "November 1, 2026";

const PROVIDERS = [
  { name: "Stripe", use: "Takes payments and collects your card, contact and shipping details at checkout" },
  { name: "Supabase", use: "Stores orders and launch email signups" },
  { name: "Resend", use: "Sends order and launch emails" },
  { name: "Vercel", use: "Hosts the website and provides visitor analytics" },
  { name: "Google (Gmail)", use: "Hosts our support inbox" },
  { name: "Spaceship", use: "Provides our domain and forwards mail sent to our snaggo.tech address" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-h3 font-bold">{title}</h2>
      <div className="mt-2 space-y-3 text-muted">{children}</div>
    </section>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function Page() {
  const business = confirmed(brand.legal.businessName) ?? brand.name;
  const address = confirmed(brand.legal.mailingAddress);
  const email = confirmed(brand.contact.email);
  const emailLink = email ? (
    <a className="font-semibold underline" href={`mailto:${email}`}>
      {email}
    </a>
  ) : (
    "our contact page"
  );

  return (
    <>
      <PageHeader eyebrow="Help" title="Privacy Policy" lead="What we collect, why we collect it, and the choices you have." />
      <div className="container-page max-w-3xl space-y-8">
        <p className="text-sm text-muted">Last updated: {LAST_UPDATED}</p>

        <Section title="Who we are">
          <p>
            {business} (&quot;{brand.name}&quot;, &quot;we&quot;) runs this website and sells Lumi companions. This policy covers this website, orders placed on it, our emails and messages you send us. We handle personal information under Canada&apos;s Personal Information Protection and Electronic Documents Act (PIPEDA) and other privacy laws that apply.
          </p>
        </Section>

        <Section title="What we collect">
          <List
            items={[
              <><strong>Orders:</strong> your name, email address, shipping address, what you ordered, the amount and the order status.</>,
              <><strong>Payments:</strong> Stripe collects your payment details on its secure checkout page. We never see or store your full card number.</>,
              <><strong>Launch emails:</strong> your email address, the launch you asked about, the consent wording you agreed to, and when you signed up, confirmed or unsubscribed.</>,
              <><strong>Spam protection:</strong> when you use a signup form, we store a scrambled (hashed) version of your IP address and the time. We don&apos;t store the IP address itself in this record.</>,
              <><strong>Support:</strong> your email address and anything you choose to include when you contact us.</>,
              <><strong>Website use:</strong> Vercel, our host, processes technical details such as your IP address, browser and the pages you request, to deliver the site, keep it secure and give us visitor statistics.</>,
            ]}
          />
        </Section>

        <Section title="Why we use it">
          <List
            items={[
              "To process, ship and support your orders, and send emails about them.",
              "To send launch emails you've asked for and confirmed.",
              "To answer your questions.",
              "To protect the site, prevent fraud and stop spam signups.",
              "To understand how the site is used and improve it.",
              "To meet our legal, tax and accounting obligations.",
            ]}
          />
          <p>We only use your information for these purposes, unless you agree to something else or the law requires or allows it.</p>
        </Section>

        <Section title="Cookies, browser storage and analytics">
          <p>We don&apos;t use advertising cookies.</p>
          <List
            items={[
              "Your browser stores your cart and whether you've dismissed the announcement bar. This stays on your device, and you can clear it in your browser settings.",
              "We use Vercel Web Analytics to count visits and popular pages. It works without cookies.",
              "Stripe may set its own cookies on its checkout page to process payments and prevent fraud.",
            ]}
          />
        </Section>

        <Section title="Who we share it with">
          <p>
            <strong>We don&apos;t sell your personal information.</strong> We share it only with service providers that help us run the store, and only what they need to do their job:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-4 font-bold text-ink">Provider</th>
                  <th scope="col" className="py-2 font-bold text-ink">What it does</th>
                </tr>
              </thead>
              <tbody>
                {PROVIDERS.map((p) => (
                  <tr key={p.name} className="border-b border-line">
                    <td className="py-2 pr-4 font-semibold whitespace-nowrap">{p.name}</td>
                    <td className="py-2">{p.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>We&apos;ll also share your shipping details with the carrier that delivers your order. We may disclose information if the law requires it, or to protect our rights or someone&apos;s safety.</p>
        </Section>

        <Section title="Where your information is stored">
          <p>We store your information in the United States, using the service providers listed above. Some of them may also process it in other countries to run their services. While your information is outside Canada, it may be subject to the laws of those countries and accessible to their courts and authorities. To ask about this, contact us using the details below.</p>
        </Section>

        <Section title="How long we keep it">
          <List
            items={[
              <><strong>Order records:</strong> six years after the end of the tax year they relate to, to meet Canadian tax requirements.</>,
              <><strong>Launch email signups:</strong> until you unsubscribe or ask us to delete them. Signups that are never confirmed are deleted within 90 days.</>,
              <><strong>Consent and unsubscribe records:</strong> up to three years after you unsubscribe, so we can honour your choice and show we followed anti-spam law.</>,
              <><strong>Hashed spam protection records:</strong> up to 30 days.</>,
              <><strong>Support emails:</strong> up to two years after your question is resolved.</>,
            ]}
          />
          <p>When we no longer need information, we delete it or make it anonymous.</p>
        </Section>

        <Section title="How we protect it">
          <p>We limit access to personal information and use services that encrypt data in transit. Our database can only be reached by our website&apos;s server and authorized administrators. No online service is perfectly secure, so we can&apos;t guarantee absolute security. If a breach creates a real risk of significant harm, we&apos;ll notify you and the regulator as the law requires.</p>
        </Section>

        <Section title="Your choices and rights">
          <p>You can ask us to:</p>
          <List
            items={[
              "Show you the personal information we hold about you and how we've used it.",
              "Correct anything that's wrong or incomplete.",
              "Delete your information, unless we have to keep it by law, such as tax records.",
              "Stop using your information where you've given consent. This may mean we can't provide a service, but it won't undo anything already done.",
            ]}
          />
          <p>Contact us at {emailLink} to make a request. We may need to confirm your identity first, and we&apos;ll reply within 30 days. There&apos;s no charge for a normal request.</p>
        </Section>

        <Section title="Marketing emails">
          <p>We only send launch emails if you tick the consent box and click the link in our confirmation email. Every marketing email identifies who sent it and has an unsubscribe link, and we act on unsubscribes promptly. You may still get emails about an order you&apos;ve placed.</p>
        </Section>

        <Section title="Children">
          <p>This site isn&apos;t directed at children under 13, and we don&apos;t knowingly collect their personal information. If you think a child has given us information, contact us and we&apos;ll delete it. Orders must be placed by an adult.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>If we change this policy, we&apos;ll post the new version here and update the date at the top. If a change significantly affects how we use your information, we&apos;ll take reasonable steps to tell you and get your consent where it&apos;s required.</p>
        </Section>

        <Section title="Contact us">
          <p>
            Our Privacy Officer is responsible for this policy. Email {emailLink}
            {address ? <>, or write to {business}, Attn: Privacy Officer, {address}</> : null}.
          </p>
          <p>
            If you&apos;re not satisfied with our answer, you can complain to the{" "}
            <a className="font-semibold underline" href="https://www.priv.gc.ca/" target="_blank" rel="noreferrer">
              Office of the Privacy Commissioner of Canada
            </a>{" "}
            or your provincial privacy regulator.
          </p>
        </Section>
      </div>
    </>
  );
}
