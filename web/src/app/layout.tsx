import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { brand } from "@/config/brand";
import { listedProducts, productBySlug } from "@/lib/catalogue";
import { env, serviceStatus } from "@/lib/env";
import { freeShippingArea } from "@/lib/shipping";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { LumiCtaPill } from "@/components/layout/LumiCtaPill";
import { Providers } from "@/components/Providers";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { JsonLd } from "@/components/JsonLd";
import { organizationLd, websiteLd } from "@/lib/structured-data";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(brand.siteUrl),
  title: { default: `${brand.name}: ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  openGraph: { siteName: brand.name, type: "website", locale: "en_CA" },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#f9f7f3", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const services = serviceStatus();
  const featured = productBySlug("pocket-lumi");
  return (
    <html lang="en-CA" className={`${manrope.variable} ${bricolage.variable}`}>
      <body className="min-h-dvh antialiased">
        <JsonLd data={organizationLd()} />
        <JsonLd data={websiteLd()} />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-chip focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <Providers
          catalogue={listedProducts()}
          services={{ checkout: services.checkout, signup: services.signup, freeShippingOver: env.shippingRules.freeOverCents, freeShippingArea: freeShippingArea(env.shippingRules, env.shippingTable, env.parcel.handlingCents) }}
          allowMixed={brand.allowMixedCarts}
        >
            <AnnouncementBar />
            <Header />
            <main id="main">{children}</main>
            <Footer />
            {featured ? <LumiCtaPill product={featured} /> : null}
            <CartDrawer />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
