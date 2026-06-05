// Server-rendered salon card for SEO content (crawlable, no client JS).
// The salon name is a stretched link (whole card → profile); the rating links
// to the reviews section. Trust row shows the rating (left) and the
// "✓ Marysoll verifikovan" badge (right). Price is dark and right-aligned.
import Link from "next/link";
import { MapPinIcon, ClockIcon } from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import type { SalonCardData } from "@/lib/seo/indexability";
import { oceneWord } from "@/lib/seo/serbianText";

function priceLabel(
  minPrice: number | null,
  hasVariants: boolean,
): string | null {
  if (!minPrice || minPrice <= 0) return null;
  const f = minPrice.toLocaleString("sr-RS");
  return hasVariants ? `od ${f} RSD` : `${f} RSD`;
}

export function SalonCard({ salon }: { salon: SalonCardData }) {
  const price = priceLabel(salon.minPrice, salon.hasVariants);
  const hasRating =
    salon.reviewCount != null && salon.reviewCount >= 1 && salon.rating != null;

  return (
    <div className="relative flex flex-col gap-2 rounded-[16px] border border-[var(--border-1)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--secondary-color)] hover:bg-[var(--surface-2)]">
      {/* Name */}
      <div className="font-bold text-[15px] leading-snug text-[var(--fg-1)]">
        <Link
          href={`/salons/${salon.slug}`}
          className="underline-offset-2 after:absolute after:inset-0 hover:underline"
        >
          {salon.name}
        </Link>
      </div>

      {/* City */}
      {salon.city && (
        <div className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--fg-3)]">
          <MapPinIcon className="h-[13px] w-[13px]" />
          {salon.city}
        </div>
      )}

      {/* Trust row: rating (left) · Marysoll verifikovan (right) */}
      <div className="flex items-center gap-2 text-[12px]">
        {hasRating && (
          <Link
            href={`/salons/${salon.slug}#utisci`}
            className="relative z-10 inline-flex items-center gap-1 font-bold text-[var(--fg-1)] hover:underline"
          >
            <StarIcon className="h-3.5 w-3.5 text-yellow-400" />
            {salon.rating!.toFixed(1)}
            <span className="font-semibold text-[var(--fg-3)]">
              · {salon.reviewCount} {oceneWord(salon.reviewCount!)}
            </span>
          </Link>
        )}
        <span className="ml-auto inline-flex items-center font-bold text-[var(--secondary-color)]">
          ✓ Marysoll verifikovan
        </span>
      </div>

      {/* Availability + price (dark, far right) */}
      <div className="mt-0.5 flex items-center gap-3 border-t border-[var(--border-1)] pt-2.5 text-[13px]">
        {salon.nextSlotCount > 0 && (
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--success)]">
            <ClockIcon className="h-[13px] w-[13px]" />
            {salon.nextSlotCount} slobodnih termina
          </span>
        )}
        {price && (
          <span className="ml-auto font-bold text-[var(--fg-1)]">{price}</span>
        )}
      </div>
    </div>
  );
}
