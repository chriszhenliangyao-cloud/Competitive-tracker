"use client";

import { useState } from "react";

export default function Thumb({
  src,
  alt,
  large,
}: {
  src: string | null | undefined;
  alt?: string;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const cls = `thumb${large ? " thumb-lg" : ""}`;
  if (!src || failed) {
    return <span className={`${cls} thumb-na`}>N/A</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={cls} src={src} alt={alt ?? ""} loading="lazy" onError={() => setFailed(true)} />;
}
