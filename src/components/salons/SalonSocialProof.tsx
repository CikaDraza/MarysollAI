"use client";

// Big-number social proof below the salon hero. Counts come from the platform
// (source of truth); "Usluga u ponudi" comes from the salon's own services.
// UI adapted from marysoll-platform Theme1SocialProof. Renders only the stats
// that are actually available, so it degrades gracefully before the platform
// stats endpoint exists.
import { formatStatValue, type SalonStats } from "@/lib/salons/tenantStats";

interface Stat {
  id: string;
  name: string;
  value: string;
}

export default function SalonSocialProof({
  stats,
  serviceCount,
}: {
  stats: SalonStats | null | undefined;
  serviceCount: number;
}) {
  const items: Stat[] = [];

  if (stats && stats.completedAppointmentCount > 0) {
    items.push({
      id: "treatments",
      name: "Urađenih tretmana",
      value: formatStatValue(stats.completedAppointmentCount),
    });
  }
  if (stats && stats.clientCount > 0) {
    items.push({
      id: "clients",
      name: "Zadovoljnih klijenata",
      value: formatStatValue(stats.clientCount),
    });
  }
  if (serviceCount > 0) {
    // Exact (not rounded) — it's a small, precise number.
    items.push({
      id: "services",
      name: "Usluga u ponudi",
      value: String(serviceCount),
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="border-t border-[var(--border-1)] py-12 sm:py-16">
      <dl className="mx-auto grid max-w-5xl grid-cols-1 gap-x-8 gap-y-10 text-center sm:grid-cols-3">
        {items.map((stat) => (
          <div key={stat.id} className="mx-auto flex max-w-xs flex-col gap-y-3">
            <dt className="text-base text-[var(--fg-2)]">{stat.name}</dt>
            <dd className="order-first text-4xl font-black tracking-tight text-[var(--fg-1)] sm:text-5xl">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
