import { CSSProperties } from "react";

/**
 * A decorative brand sticker. Per the brand philosophy, stickers live AROUND
 * content, not inside reading areas — so these are aria-hidden by default and
 * can gently bob (motion is disabled for prefers-reduced-motion via CSS).
 */
export default function Sticker({
  src,
  alt = "",
  className = "",
  bob = false,
  rotate = 0,
  width,
}: {
  src: string;
  alt?: string;
  className?: string;
  bob?: boolean | "slow";
  rotate?: number;
  width?: number | string;
}) {
  const style: CSSProperties = {
    ["--yh-rot" as string]: `${rotate}deg`,
    transform: `rotate(${rotate}deg)`,
    width: typeof width === "number" ? `${width}px` : width,
  };
  const bobClass = bob === "slow" ? "yh-bob-slow" : bob ? "yh-bob" : "";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      loading="lazy"
      draggable={false}
      className={`pointer-events-none select-none ${bobClass} ${className}`}
      style={style}
    />
  );
}
