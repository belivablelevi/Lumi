import type { Metadata } from "next";
import { OrderStatus } from "@/components/cart/OrderStatus";

export const metadata: Metadata = { title: "Order status", robots: { index: false } };

export default async function Page({ searchParams }: PageProps<"/checkout/success">) {
  const q = await searchParams;
  const order = typeof q.order === "string" ? q.order : "";
  const session = typeof q.session_id === "string" ? q.session_id : "";
  return (
    <div className="container-page max-w-2xl pt-12 pb-10">
      <OrderStatus order={order} session={session} />
    </div>
  );
}
