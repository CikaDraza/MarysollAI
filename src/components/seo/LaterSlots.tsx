// "Kasniji termini" — if it's morning, this afternoon's slots; if afternoon,
// tomorrow's (see buildLaterSlots). Each chip links to the salon profile.
import Link from "next/link";
import { ClockIcon } from "@heroicons/react/24/outline";
import type { LaterSlot } from "@/lib/seo/indexability";
import { cityLocative } from "@/lib/seo/cityGrammar";
import { blockClass, chipClass, h2Class } from "./styles";

export function LaterSlots({
  city,
  slots,
}: {
  city: string;
  slots: LaterSlot[];
}) {
  if (slots.length === 0) return null;
  const when = slots[0].when === "today" ? "danas popodne" : "sutra";
  return (
    <div className={blockClass}>
      <h2 className={h2Class}>
        Kasniji termini u {cityLocative(city)} — {when}
      </h2>
      <div className="flex flex-wrap gap-2">
        {slots.map((s, i) => (
          <Link
            key={`${s.salonSlug}-${s.date}-${s.time}-${i}`}
            href={`/salons/${s.salonSlug}`}
            className={chipClass}
          >
            <ClockIcon className="h-[13px] w-[13px]" />
            {s.time} · {s.salonName}
          </Link>
        ))}
      </div>
    </div>
  );
}
