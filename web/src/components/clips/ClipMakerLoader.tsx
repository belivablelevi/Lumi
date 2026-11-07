"use client";

import dynamic from "next/dynamic";

/** The Clip maker only runs in the browser: it draws with WebGL and remembers settings locally. */
export const ClipMakerLoader = dynamic(() => import("./ClipMaker").then((m) => m.ClipMaker), {
  ssr: false,
  loading: () => <p className="mt-6 text-muted">Loading the Clip maker…</p>,
});
