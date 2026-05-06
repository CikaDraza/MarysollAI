"use client";

import Image from "next/image";
import { SparklesIcon } from "@heroicons/react/24/outline";

interface Props {
  onOpenAI: () => void;
}

export default function AIPrompt({ onOpenAI }: Props) {
  return (
    <section className="mt-[200px]">
      <div className="flex items-center gap-[18px] bg-[var(--surface-2)] border border-[var(--brand-100)] rounded-[28px] px-6 py-[22px] flex-wrap">
        {/* Avatar */}
        <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 relative">
          <Image
            src="/avatars/maria.png"
            alt="Maria"
            width={56}
            height={56}
            className="object-cover w-full h-full"
          />
        </div>

        {/* Tekst */}
        <div className="flex-1 min-w-[180px]">
          <h2 className="font-bold text-[22px] leading-tight mb-1.5 text-[var(--fg-1)]">
            Ne znaš šta ti treba?
          </h2>
          <p className="font-normal text-sm leading-relaxed text-[var(--fg-2)] mt-1 max-w-[420px]">
            Maria može da rezerviše, prikaže slobodne termine i ispuni kalendar
            umesto tebe — uz jedan klik za potvrdu.
          </p>
        </div>

        {/* Dugme */}
        <button
          onClick={onOpenAI}
          className="ml-auto inline-flex items-center gap-2 border-none cursor-pointer font-bold text-sm px-[18px] py-3 rounded-[14px] bg-[var(--surface)] text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--border-2)] hover:bg-[var(--surface-elev)] transition-colors"
        >
          <SparklesIcon className="w-4 h-4" strokeWidth={1.5} />
          Pitaj Mariju
        </button>
      </div>
    </section>
  );
}
