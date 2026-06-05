// Server-rendered FAQ using native <details> (works without JS; question +
// answer are in the HTML for crawlers and mirror the FAQPage JSON-LD).
import type { FaqItem } from "@/lib/seo/faq";
import { blockClass, h2Class } from "./styles";

export function FaqSection({
  heading,
  items,
}: {
  heading: string;
  items: FaqItem[];
}) {
  if (items.length === 0) return null;
  return (
    <div className={blockClass}>
      <h2 className={h2Class}>{heading}</h2>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <details
            key={it.question}
            className="group rounded-[14px] border border-[var(--border-1)] bg-[var(--surface)] p-4"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[15px] font-bold text-[var(--fg-1)]">
              {it.question}
              <span className="text-[18px] leading-none text-[var(--fg-3)] transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--fg-2)]">
              {it.answer}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
