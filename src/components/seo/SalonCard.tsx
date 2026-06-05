// Server-rendered salon card for SEO content (crawlable, no client JS).
// The salon name is a stretched link (whole card → profile); the rating is a
// separate link to the reviews section. Rating shows only when stats were
// fetched (reviewCount defined) — avoids a false "Novo" on un-enriched cards.
import Link from "next/link";
import { MapPinIcon, ClockIcon } from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import type { SalonCardData } from "@/lib/seo/indexability";
import { oceneWord } from "@/lib/seo/serbianText";

function priceLabel(minPrice: number | null, hasVariants: boolean): string | null {
  if (!minPrice || minPrice <= 0) return null;
  const f = minPrice.toLocaleString("sr-RS");
  return hasVariants ? `od ${f} RSD` : `${f} RSD`;
}

function RatingRow({ salon }: { salon: SalonCardData }) {
  if (salon.reviewCount == null) return null; // stats not fetched → show nothing

  if (salon.reviewCount >= 1 && salon.rating != null) {
    return (
      <Link
        href={`/salons/${salon.slug}#utisci`}
        className="relative z-10 inline-flex w-fit items-center gap-1.5 text-[13px] font-bold text-[var(--fg-1)] hover:underline"
      >
        <StarIcon className="h-3.5 w-3.5 text-yellow-400" />
        {salon.rating.toFixed(1)}
        <span className="font-semibold text-[var(--fg-3)]">
          · {salon.reviewCount} {oceneWord(salon.reviewCount)}
        </span>
      </Link>
    );
  }

  return (
    <span className="inline-flex w-fit items-center text-[12px] font-bold text-[var(--secondary-color)]">
      Novo na Marysoll
    </span>
  );
}

export function SalonCard({ salon }: { salon: SalonCardData }) {
  const price = priceLabel(salon.minPrice, salon.hasVariants);
  return (
    <div className="relative flex flex-col gap-2 rounded-[16px] border border-[var(--border-1)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--secondary-color)] hover:bg-[var(--surface-2)]">
      <div className="font-bold text-[15px] text-[var(--fg-1)]">
        <Link
          href={`/salons/${salon.slug}`}
          className="underline-offset-2 after:absolute after:inset-0 hover:underline"
        >
          {salon.name}
        </Link>
      </div>
      {salon.city && (
        <div className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--fg-3)]">
          <MapPinIcon className="h-[13px] w-[13px]" />
          {salon.city}
        </div>
      )}

      <RatingRow salon={salon} />

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        {price && (
          <span className="font-bold text-[var(--secondary-color)]">{price}</span>
        )}
        {salon.nextSlotCount > 0 && (
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--success)]">
            <ClockIcon className="h-[13px] w-[13px]" />
            {salon.nextSlotCount} slobodnih termina
          </span>
        )}
      </div>
    </div>
  );
}
