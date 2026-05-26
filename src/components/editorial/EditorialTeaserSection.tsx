import type { BlogTeaserSection } from "@/types/editorial";
import EditorialTeaserCard from "./EditorialTeaserCard";

export default function EditorialTeaserSection({
  title,
  subtitle,
  items,
}: BlogTeaserSection) {
  const visibleItems = items.slice(0, 6);
  const titleId = `editorial-teasers-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;

  if (visibleItems.length === 0) return null;

  return (
    <section
      aria-labelledby={titleId}
      className="mt-16 border-t border-[var(--border-1)] pt-10"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="m-0 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--secondary-color)]">
            Marysoll editorial
          </p>
          <h2
            id={titleId}
            className="mt-2 text-[26px] font-bold leading-tight text-[var(--fg-1)] sm:text-[30px]"
          >
            {title}
          </h2>
          {subtitle && (
            <p className="mt-3 text-[15px] leading-7 text-[var(--fg-2)]">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((item) => (
          <EditorialTeaserCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
