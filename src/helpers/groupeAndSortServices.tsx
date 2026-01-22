import { HomePagePosition, IService } from "@/types/services-type";

export interface GroupedServices {
  category: string;
  services: IService[];
}

export function groupAndSortServices(services: IService[]): GroupedServices[] {
  // 1. Grupisanje po kategoriji
  const grouped = services.reduce<Record<string, IService[]>>(
    (acc, service) => {
      const category = service.category || "Ostalo";

      if (!acc[category]) acc[category] = [];
      acc[category].push(service);

      return acc;
    },
    {},
  );

  // Prioritet sortiranja
  const FEATURE_ORDER: Record<HomePagePosition, number> = {
    main: 1,
    second: 2,
    third: 3,
    none: 4,
  };

  // 2. Sortiranje unutar kategorija
  const sortedCategories: GroupedServices[] = Object.entries(grouped).map(
    ([category, services]) => ({
      category,
      services: services.sort((a, b) => {
        const fa: HomePagePosition = a.featured ?? "none";
        const fb: HomePagePosition = b.featured ?? "none";

        return FEATURE_ORDER[fa] - FEATURE_ORDER[fb];
      }),
    }),
  );

  return sortedCategories;
}
