// Server-rendered salon card for SEO content (crawlable, no client JS).
import Link from "next/link";
import { MapPinIcon, ClockIcon } from "@heroicons/react/24/outline";
import type { SalonCardData } from "@/lib/seo/indexability";

function priceLabel(minPrice: number | null, hasVariants: boolean): string | null {
  if (!minPrice || minPrice <= 0) return null;
  const f = minPrice.toLocaleString("sr-RS");
  return hasVariants ? `od ${f} RSD` : `${f} RSD`;
}

export function SalonCard({ salon }: { salon: SalonCardData }) {
  const price = priceLabel(salon.minPrice, salon.hasVariants);
  return (
    <Link
      href={`/salons/${salon.slug}`}
      className="flex flex-col gap-2 rounded-[16px] border border-[var(--border-1)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--secondary-color)] hover:bg-[var(--surface-2)]"
    >
      <div className="font-bold text-[15px] text-[var(--fg-1)]">{salon.name}</div>
      {salon.city && (
        <div className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--fg-3)]">
          <MapPinIcon className="h-[13px] w-[13px]" />
          {salon.city}
        </div>
      )}
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
    </Link>
  );
}
