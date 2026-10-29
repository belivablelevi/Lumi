import { manifest } from "@/lib/lumi-frames";
import { OledScreen } from "@/components/lumi/OledScreen";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  const p = manifest.personas[1]!;
  return (
    <div className="container-page max-w-2xl pt-12 pb-10 text-center">
      <div className="mx-auto max-w-md rounded-panel bg-night p-5">
        <div className="aspect-[2/1]"><OledScreen src={p.expressions} frame={manifest.expressions.indexOf("confused")} label="A confused Lumi" /></div>
      </div>
      <h1 className="mt-8 text-h1 font-extrabold">This page wandered off</h1>
      <p className="mt-3 text-muted">We couldn&apos;t find what you were looking for.</p>
      <ButtonLink href="/" className="mt-6">Back home</ButtonLink>
    </div>
  );
}
