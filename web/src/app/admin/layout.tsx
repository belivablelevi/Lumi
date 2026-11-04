import type { Metadata } from "next";

export const metadata: Metadata = { title: "Orders", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="container-page max-w-5xl pt-8 pb-16">{children}</div>;
}
