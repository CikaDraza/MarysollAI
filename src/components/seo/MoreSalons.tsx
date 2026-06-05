// "Još salona u {grad}" — other salons in the city (beyond the recommended set
// for this category). Server-rendered directory links.
import type { SalonCardData } from "@/lib/seo/indexability";
import { cityLocative } from "@/lib/seo/cityGrammar";
import { SalonCard } from "./SalonCard";
import { blockClass, cardGridClass, h2Class } from "./styles";

export function MoreSalons({
  city,
  salons,
}: {
  city: string;
  salons: SalonCardData[];
}) {
  if (salons.length === 0) return null;
  return (
    <div className={blockClass}>
      <h2 className={h2Class}>Još salona u {cityLocative(city)}</h2>
      <div className={cardGridClass}>
        {salons.map((s) => (
          <SalonCard key={s.slug} salon={s} />
        ))}
      </div>
    </div>
  );
}
