import type { Metadata } from "next";
import { CartPageView } from "@/components/cart/CartPageView";

export const metadata: Metadata = { title: "Cart", robots: { index: false } };

export default function Page() {
  return <CartPageView />;
}
