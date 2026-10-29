import { products, type Product } from "@/content/products";

/** A Pocket Lumi open for pre-order and an in-stock accessory, for checkout tests. */
export function testCatalogue(): Product[] {
  const pocket = products.find((p) => p.slug === "pocket-lumi")!;
  return [
    {
      ...pocket,
      status: "preorder",
      price: { amount: 5900, currency: "CAD" },
      preorder: { dispatchWindow: "Spring", paymentTiming: "Charged now", cancellation: "Any time before dispatch", delays: "Email + refund option" },
    },
    { ...pocket, id: "strap", sku: "LUMI-STRAP", slug: "strap", name: "Strap", status: "available", price: { amount: 1200, currency: "CAD" }, preorder: undefined, maxPerOrder: 5 },
    { ...pocket, id: "soon", sku: "LUMI-SOON", slug: "soon", name: "Soon", status: "coming_soon" },
  ];
}
