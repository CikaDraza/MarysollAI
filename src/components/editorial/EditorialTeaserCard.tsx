import { ArrowUpRightIcon } from "@heroicons/react/24/outline";
import type { BlogTeaserCard as BlogTeaserCardType } from "@/types/editorial";

const categoryStyles: Record<string, string> = {
  Makeup: "bg-rose-50 text-rose-700 ring-rose-100",
  Nails: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100",
  Hair: "bg-amber-50 text-amber-800 ring-amber-100",
  Massage: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  Marysoll: "bg-sky-50 text-sky-700 ring-sky-100",
  Affiliate: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  "Growth OS": "bg-lime-50 text-lime-800 ring-lime-100",
  "Booking visibility": "bg-slate-100 text-slate-700 ring-slate-200",
  "AI marketing": "bg-violet-50 text-violet-700 ring-violet-100",
  "Online zakazivanje": "bg-cyan-50 text-cyan-700 ring-cyan-100",
};

// Fallback for free-form platform categories (e.g. "Beauty", "Growth").
const DEFAULT_CATEGORY_STYLE = "bg-slate-50 text-slate-700 ring-slate-100";

interface Props {
  item: BlogTeaserCardType;
}

export default function EditorialTeaserCard({ item }: Props) {
  const isExternal =
    item.href.startsWith("http://") || item.href.startsWith("https://");
  const sourceTypeLabel =
    item.hrefType === "tenant" ? "Salon blog" : "Marysoll vodič";
  const actionLabel =
    item.audience === "partner"
      ? "Postani partner"
      : item.hrefType === "tenant"
        ? "Pročitaj na sajtu salona"
        : "Pročitaj vodič";

  return (
    <article className="group flex h-full flex-col rounded-[8px] border border-[var(--border-1)] bg-[var(--surface)] p-4 shadow-[var(--shadow-xs)] transition hover:-translate-y-0.5 hover:border-[var(--border-2)] hover:shadow-[var(--shadow-sm)]">
      {item.imageUrl && (
        <div
          className="mb-4 aspect-[16/9] rounded-[8px] bg-cover bg-center"
          role="img"
          aria-label={item.imageAlt ?? item.title}
          style={{ backgroundImage: `url(${item.imageUrl})` }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ring-1 ${categoryStyles[item.category] ?? DEFAULT_CATEGORY_STYLE}`}
        >
          {item.category}
        </span>
        <span className="text-[12px] font-semibold text-[var(--fg-3)]">
          {sourceTypeLabel}
        </span>
      </div>

      <h3 className="mt-4 text-[18px] font-bold leading-snug text-[var(--fg-1)]">
        {item.title}
      </h3>
      <p className="mt-3 line-clamp-3 text-[14px] leading-6 text-[var(--fg-2)]">
        {item.excerpt}
      </p>

      <div className="mt-5 flex flex-1 items-end justify-between gap-4">
        <p className="m-0 text-[12px] font-semibold text-[var(--fg-3)]">
          {item.sourceLabel}
        </p>
        <a
          href={item.href}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full text-right text-[13px] font-bold text-[var(--secondary-color)] transition hover:text-[var(--secondary-hover)]"
        >
          {actionLabel}
          <ArrowUpRightIcon className="h-4 w-4" strokeWidth={1.8} />
        </a>
      </div>
    </article>
  );
}
