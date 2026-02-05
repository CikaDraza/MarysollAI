// src/lib/ai/formatters.ts

import { DaySchedule, SalonProfile } from "@/types/salon-profile-type";
import { IService, IServiceVariant } from "@/types/services-type";

export function formatKnowledgeBase(
  services: IService[],
  profile: SalonProfile,
) {
  const servicesText = services
    .map((s) => {
      const variantList =
        s.variants?.map((v: IServiceVariant) => v.name).join(", ") || "Nema";
      return `- [ID: ${s._id}], Trajanje: ${s.duration} min, ${s.category} > ${s.name}: Cena: ${s.basePrice} RSD. Varijante: [${variantList}]`;
    })
    .join("\n");

  const wh = profile?.workingHours || {};
  const workingHoursText = (Object.entries(wh) as [string, DaySchedule][])
    .map(
      ([day, config]) =>
        `${day}: ${config.isClosed ? "Neradni dan" : `${config.open} - ${config.close}`}`,
    )
    .join(", ");

  return { servicesText, workingHoursText };
}
