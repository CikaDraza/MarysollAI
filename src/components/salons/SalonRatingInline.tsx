"use client";

// Trust row for dense slot cards / search results. Every card shows the
// "✓ Marysoll verifikovan" badge; when a real rating exists it sits in front,
// with the two ends justified apart.
import { StarIcon } from "@heroicons/react/24/solid";
import { CheckIcon } from "@heroicons/react/16/solid";
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
  const hasRating = rating != null && (reviewCount ?? 0) >= 1;

  return (
    <span
      className={`flex w-full items-center justify-between gap-2 ${className}`}
    >
      {hasRating && (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold">
          <StarIcon className="h-3 w-3 text-yellow-400" />
          <span style={{ color: "var(--fg-2)" }}>{rating!.toFixed(1)}</span>
          <span className="font-semibold" style={{ color: "var(--fg-3)" }}>
            · {reviewCount} {oceneWord(reviewCount!)}
          </span>
        </span>
      )}
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-bold text-[var(--secondary-color)]">
        <CheckIcon className="h-3 w-3" />
        Marysoll verifikovan
      </span>
    </span>
  );
}
