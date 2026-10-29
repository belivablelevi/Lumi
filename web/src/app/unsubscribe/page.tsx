import type { Metadata } from "next";
import { hash } from "@/lib/signup";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/unsubscribe">) {
  const { token } = await searchParams;
  const store = getStore();
  const ok = typeof token === "string" && token.length > 10 && store ? await store.unsubscribe(hash(token)) : false;
  return (
    <div className="container-page max-w-2xl pt-12 pb-10">
      <div className="rounded-panel bg-white p-10 text-center ring-1 ring-line">
        <h1 className="text-h2 font-bold">{ok ? "You're unsubscribed" : "That link didn't work"}</h1>
        <p className="mt-2 text-muted">{ok ? "You won't get any more launch emails from us." : "If you keep getting emails you don't want, reply to one and we'll remove you by hand."}</p>
      </div>
    </div>
  );
}
