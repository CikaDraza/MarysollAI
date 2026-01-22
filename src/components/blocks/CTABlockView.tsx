"use client";

import Link from "next/link";
import clsx from "clsx";
import { CTABlock } from "@/types/landing-blocks";

export function CTABlockView({ block }: { block: CTABlock }) {
  const { id, ctaLabel, href, align, size, variant } = block;

  const styles = clsx(
    "mx-auto inline-flex w-full justify-center rounded-md px-6 py-4 text-sm font-semibold transition",
    variant === "primary"
      ? "bg-(--secondary-color) text-white hover:bg-(--secondary-color)/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--primary-color)"
      : "bg-white text-gray-900 shadow-xs inset-ring inset-ring-gray-300 hover:bg-gray-50 sm:w-auto",
    size === "lg" && "text-lg",
    size === "md" && "text-md",
    size === "sm" && "text-sm",
    size === "xs" && "text-xs",
    align === "center" ? "text-center" : "text-left",
  );

  return (
    <Link id={id} href={href || "/"} className={styles}>
      {ctaLabel}
    </Link>
  );
}
