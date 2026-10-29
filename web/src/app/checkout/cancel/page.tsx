import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Checkout cancelled", robots: { index: false } };

export default function Page() {
  return (
    <div className="container-page max-w-2xl pt-12 pb-10">
      <div className="rounded-panel bg-white p-10 text-center ring-1 ring-line">
        <h1 className="text-h2 font-bold">Checkout cancelled</h1>
        <p className="mt-2 text-muted">No payment was taken. Your cart is just as you left it.</p>
        <ButtonLink href="/cart" className="mt-6">Back to cart</ButtonLink>
      </div>
    </div>
  );
}
