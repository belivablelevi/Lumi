import type { Metadata } from "next";
import { PrintView } from "@/components/studio/print/PrintView";
import { requireAdmin } from "@/lib/admin-session";

export const metadata: Metadata = { title: "Lumi Studio print", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const DOCS = ["cards", "odds", "odds-letter"] as const;

/** Birth certificates and odds cards, laid out for printing or saving as PDF from Chrome. */
export default async function Page({ searchParams }: PageProps<"/admin/studio/print">) {
  await requireAdmin();
  const { doc } = await searchParams;
  const which = DOCS.find((d) => d === doc) ?? "odds";
  return <PrintView doc={which} />;
}
