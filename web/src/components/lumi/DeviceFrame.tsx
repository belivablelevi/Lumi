import Image from "next/image";
import type { GalleryImage } from "@/content/products";
import { OledScreen } from "./OledScreen";

/**
 * A front-on render of the real case design with the firmware's frames
 * playing on its screen.
 */
export function DeviceFrame({
  image,
  src,
  label,
  priority = false,
  sizes = "(min-width: 1024px) 40vw, 90vw",
  frame,
  className = "",
}: {
  image: GalleryImage;
  src: string;
  label: string;
  priority?: boolean;
  sizes?: string;
  frame?: number;
  className?: string;
}) {
  const s = image.screen;
  return (
    <div className={`relative ${className}`}>
      <div className="floor-shadow absolute inset-x-[22%] bottom-[18%] h-[8%]" aria-hidden />
      <div className="relative" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
        <Image src={image.src} alt={image.alt} fill sizes={sizes} priority={priority} className="object-contain" />
        {s ? (
          <div
            className="absolute"
            style={{ left: `${s.left * 100}%`, top: `${s.top * 100}%`, width: `${s.width * 100}%`, height: `${s.height * 100}%` }}
          >
            <OledScreen src={src} label={label} frame={frame} grid={false} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
