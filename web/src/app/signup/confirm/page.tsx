import type { Metadata } from "next";
import { hash } from "@/lib/signup";
import { getStore } from "@/lib/store";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Confirm signup", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/signup/confirm">) {
  const { token } = await searchParams;
  const store = getStore();
  const ok = typeof token === "string" && token.length > 10 && store ? await store.confirmSignup(hash(token)) : false;
  return (
    <div className="container-page max-w-2xl pt-12 pb-10">
      <div className="rounded-panel bg-white p-10 text-center ring-1 ring-line">
        <h1 className="text-h2 font-bold">{ok ? "You're on the list" : "That link didn't work"}</h1>
        <p className="mt-2 text-muted">
          {ok ? "We'll email you about launches. Every email has an unsubscribe link." : "It may have expired or already been used. You can sign up again any time."}
        </p>
        <ButtonLink href={ok ? "/" : "/launches"} className="mt-6">{ok ? "Back to Snaggo" : "Launches"}</ButtonLink>
      </div>
    </div>
  );
}
