// "Slične usluge u {grad}" — internal links to other categories available in the
// city. Strengthens the internal link graph (city ↔ category).
import Link from "next/link";
import type { CityCategoryLink } from "@/lib/seo/indexability";
import { CATEGORY_KEYWORDS } from "@/lib/seo/categoryKeywords";
import { cityLocative } from "@/lib/seo/cityGrammar";
import { blockClass, chipClass, h2Class } from "./styles";

export function RelatedServices({
  city,
  citySlug,
  categories,
}: {
  city: string;
  citySlug: string;
  categories: CityCategoryLink[];
}) {
  if (categories.length === 0) return null;
  return (
    <div className={blockClass}>
      <h2 className={h2Class}>Slične usluge u {cityLocative(city)}</h2>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/${citySlug}/${c.urlSlug}`}
            className={chipClass}
          >
            {CATEGORY_KEYWORDS[c.slug].h1Noun}
            <span className="text-[var(--fg-3)]">{c.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
