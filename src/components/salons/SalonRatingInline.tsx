"use client";

// Compact salon rating for dense slot cards / search results. Shows
// "⭐ 4.9 · 23 ocene" only when a real rating exists; renders nothing otherwise
// (no "Novo" badge here — that lives on the prominent SEO/profile cards, so
// dense slot lists stay clean and never look mislabeled).
import { StarIcon } from "@heroicons/react/24/solid";
import { oceneWord } from "@/lib/seo/serbianText";

export function SalonRatingInline({
  rating,
  reviewCount,
  className = "",
}: {
  rating?: number | null;
  reviewCount?: number;
  className?: string;
}) {
  if (rating == null || (reviewCount ?? 0) < 1) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold ${className}`}
    >
      <StarIcon className="h-3 w-3 text-yellow-400" />
      <span style={{ color: "var(--fg-2)" }}>{rating.toFixed(1)}</span>
      <span className="font-semibold" style={{ color: "var(--fg-3)" }}>
        · {reviewCount} {oceneWord(reviewCount!)}
      </span>
    </span>
  );
}
