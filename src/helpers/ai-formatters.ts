// src/helpers/ai-formatters.ts

import { IService } from "@/types/services-type";

export function formatServicesForAI(services: IService[]) {
  return services
    .map((s) => {
      const variants = s.variants
        ?.map((v) => `${v.name} (${v.price} RSD)`)
        .join(", ");
      return `- ${s.category} > ${s.name}${s.subcategory ? ` (${s.subcategory})` : ""}: ${s.basePrice} RSD. Varijante: [${variants}]`;
    })
    .join("\n");
}
