import { haversineKm, SERBIAN_CITIES } from "@/lib/cities";
import type { PlatformKnowledge } from "@/lib/ai/platform-knowledge";
import type { SemanticMemory } from "@/lib/ai/memory/agent-memory-types";

export interface AgentClaimData {
  agent: "maria" | "claudia";
  requestedCity?: string;
  requestedService?: string;
  requestedCategory?: string;
  claimedCity?: string;
  salon?: {
    id?: string;
    name?: string;
    city?: string;
  };
  slot?: {
    city?: string;
    salonId?: string;
    salonName?: string;
    serviceName?: string;
    startTime?: string;
  };
  message?: string;
}

export interface ValidatedAgentClaim {
  valid: boolean;
  correctedMessage?: string;
  reason?:
    | "city_mismatch"
    | "missing_service"
    | "missing_salon"
    | "generic_placeholder"
    | "invalid_template"
    | "unknown";
}

export interface CityServiceAvailability {
  city?: string;
  hasSalonInCity: boolean;
  hasServiceInCity: boolean;
  matchingSalons: {
    id?: string;
    name?: string;
    city?: string;
  }[];
  nearestAlternatives: {
    city?: string;
    salonName?: string;
    serviceName?: string;
    distanceKm?: number;
  }[];
}

function normalize(text?: string): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "dj")
    .replace(/\s+/g, " ")
    .trim();
}

function sameCity(a?: string, b?: string): boolean {
  return Boolean(a && b && normalize(a) === normalize(b));
}

function cityLocative(city: string): string {
  if (city === "Bor") return "Boru";
  if (city === "Novi Sad") return "Novom Sadu";
  if (city === "Beograd") return "Beogradu";
  if (city === "Ruma") return "Rumi";
  if (city === "Leskovac") return "Leskovcu";
  if (city === "Sremska Mitrovica") return "Sremskoj Mitrovici";
  return city;
}

function messageMentionsCity(message: string | undefined, city: string | undefined): boolean {
  if (!message || !city) return false;
  const normalizedMessage = normalize(message);
  return [city, cityLocative(city)].some((item) => normalizedMessage.includes(normalize(item)));
}

function correctedCityMismatchMessage(input: AgentClaimData): string {
  const requestedCity = input.requestedCity ?? input.claimedCity;
  const salonName = input.salon?.name ?? input.slot?.salonName;
  const actualCity = input.salon?.city ?? input.slot?.city;
  if (requestedCity && salonName && actualCity) {
    return `Trenutno nemamo salon u ${cityLocative(requestedCity)}. Najbliža dostupna opcija je ${salonName} u ${cityLocative(actualCity)}.`;
  }
  if (requestedCity) {
    return `Trenutno nemamo salon u ${cityLocative(requestedCity)}. Mogu da proverim najbliže dostupne opcije.`;
  }
  return "Mogu da proverim najbliže dostupne opcije.";
}

function sanitizeTemplates(message: string, service?: string): string {
  return message
    .replace(/\bsalon za salon\b/gi, "salon")
    .replace(/\btražena usluga\b/gi, service || "ovu uslugu")
    .replace(/\btrazena usluga\b/gi, service || "ovu uslugu")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateAgentClaim(input: AgentClaimData): ValidatedAgentClaim {
  const requestedCity = input.requestedCity;
  const message = input.message;
  const correctedTemplate = message
    ? sanitizeTemplates(message, input.requestedService)
    : undefined;

  const salonCityMismatch = Boolean(
    requestedCity && input.salon?.city && !sameCity(requestedCity, input.salon.city),
  );
  const slotCityMismatch = Boolean(
    requestedCity && input.slot?.city && !sameCity(requestedCity, input.slot.city),
  );
  const messageCityMismatch = Boolean(
    requestedCity &&
      messageMentionsCity(message, requestedCity) &&
      ((input.salon?.city && !sameCity(requestedCity, input.salon.city)) ||
        (input.slot?.city && !sameCity(requestedCity, input.slot.city))),
  );

  if (salonCityMismatch || slotCityMismatch || messageCityMismatch) {
    return {
      valid: false,
      correctedMessage: correctedCityMismatchMessage(input),
      reason: "city_mismatch",
    };
  }

  if (/\btražena usluga\b|\btrazena usluga\b/i.test(message ?? "") && !input.requestedService) {
    return {
      valid: false,
      correctedMessage: correctedTemplate,
      reason: "missing_service",
    };
  }

  if (/\bsalon za salon\b/i.test(message ?? "")) {
    return {
      valid: false,
      correctedMessage: correctedTemplate,
      reason: "invalid_template",
    };
  }

  if (correctedTemplate && correctedTemplate !== message) {
    return {
      valid: false,
      correctedMessage: correctedTemplate,
      reason: "generic_placeholder",
    };
  }

  return { valid: true };
}

function cityCoordinates(cityName?: string): { lat: number; lng: number } | undefined {
  const normalized = normalize(cityName);
  const city = SERBIAN_CITIES.find((item) => normalize(item.name) === normalized);
  return city ? { lat: city.lat, lng: city.lng } : undefined;
}

function serviceMatches(input: {
  query?: string;
  category?: string;
  serviceName?: string;
  semanticMemory?: SemanticMemory;
}): boolean {
  const query = normalize(input.query);
  const category = normalize(input.category);
  const serviceName = normalize(input.serviceName);
  if (!query && !category) return true;
  if (query && serviceName.includes(query)) return true;
  if (category && serviceName.includes(category)) return true;

  return Boolean(
    input.semanticMemory?.services.some((service) => {
      const serviceTerms = [service.label, ...service.synonyms]
        .filter(Boolean)
        .map((item) => normalize(String(item)));
      const categoryTerms = [service.categoryLabel, service.categoryKey]
        .filter(Boolean)
        .map((item) => normalize(String(item)));
      const actualServiceMatches = serviceTerms.some(
        (term) => term && (serviceName.includes(term) || term.includes(serviceName)),
      );
      const matchesQuery = query
        ? serviceTerms.some((term) => term.includes(query) || query.includes(term))
        : true;
      const matchesCategory = category
        ? categoryTerms.some((term) => term.includes(category) || category.includes(term))
        : true;
      return actualServiceMatches && matchesQuery && matchesCategory;
    }),
  );
}

export function resolveCityServiceAvailability(input: {
  city?: string;
  service?: string;
  category?: string;
  platformKnowledge?: PlatformKnowledge;
  semanticMemory?: SemanticMemory;
}): CityServiceAvailability {
  const salons = input.platformKnowledge?.raw?.salons ?? [];
  const services = input.platformKnowledge?.raw?.services ?? [];
  const semanticMemory = input.semanticMemory ?? input.platformKnowledge?.semanticMemory;
  const matchingSalons = salons
    .filter((salon) => sameCity(salon.city, input.city))
    .map((salon) => ({
      id: String(salon._id ?? salon.id ?? ""),
      name: salon.name,
      city: salon.city,
    }));

  const serviceSalonIds = new Set(
    services
      .filter((service) =>
        serviceMatches({
          query: input.service,
          category: input.category,
          serviceName: service.name,
          semanticMemory,
        }),
      )
      .map((service) => String(service.salonId ?? service._salonId ?? "")),
  );

  const strictKnown = Boolean(input.service || input.category);
  const hasServiceInCity = strictKnown
    ? matchingSalons.some((salon) => salon.id && serviceSalonIds.has(salon.id))
    : matchingSalons.length > 0;
  const origin = cityCoordinates(input.city);
  const nearestAlternatives = salons
    .filter((salon) => !sameCity(salon.city, input.city))
    .filter((salon) => {
      if (!strictKnown) return true;
      const salonId = String(salon._id ?? salon.id ?? "");
      return serviceSalonIds.has(salonId);
    })
    .map((salon) => {
      const target = cityCoordinates(salon.city);
      const distanceKm = origin && target
        ? Math.round(haversineKm(origin.lat, origin.lng, target.lat, target.lng))
        : undefined;
      const salonId = String(salon._id ?? salon.id ?? "");
      const matchedService = services.find((service) => {
        const serviceSalonId = String(service.salonId ?? service._salonId ?? "");
        return serviceSalonId === salonId;
      });
      return {
        city: salon.city,
        salonName: salon.name,
        serviceName: matchedService?.name,
        distanceKm,
      };
    })
    .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY))
    .slice(0, 3);

  return {
    city: input.city,
    hasSalonInCity: matchingSalons.length > 0,
    hasServiceInCity,
    matchingSalons,
    nearestAlternatives,
  };
}

export function formatNearestSalonAnswer(input: {
  requestedCity?: string;
  alternative?: { salonName?: string; city?: string; distanceKm?: number };
}): string {
  if (input.requestedCity && input.alternative?.salonName && input.alternative.city) {
    const distance = input.alternative.distanceKm != null
      ? `, oko ${input.alternative.distanceKm} km od ${input.requestedCity}`
      : "";
    return `Trenutno nemamo salon u ${cityLocative(input.requestedCity)}. Najbliža dostupna opcija je ${input.alternative.salonName} u ${cityLocative(input.alternative.city)}${distance}.`;
  }
  if (input.requestedCity) {
    return `Trenutno nemamo salon u ${cityLocative(input.requestedCity)}. Mogu da proverim najbliže dostupne opcije.`;
  }
  return "Za koji grad da proverim najbliži salon?";
}

export function formatSalonExistenceAnswer(input: {
  requestedCity?: string;
  actualCity?: string;
  salonName?: string;
}): string {
  if (
    input.requestedCity &&
    input.actualCity &&
    !sameCity(input.requestedCity, input.actualCity)
  ) {
    return `Ne, taj salon je u ${cityLocative(input.actualCity)}. U ${cityLocative(input.requestedCity)} trenutno nemamo salon na platformi.`;
  }
  if (input.requestedCity && input.salonName) {
    return `Da, ${input.salonName} je u ${cityLocative(input.requestedCity)}.`;
  }
  return "Mogu da proverim, samo mi napišite grad.";
}

export function formatServiceAvailabilityAnswer(input: {
  requestedCity?: string;
  service?: string;
  slots?: { city?: string; salonName?: string }[];
}): string {
  const service = input.service || "ovu uslugu";
  const first = input.slots?.[0];
  if (
    input.requestedCity &&
    first?.city &&
    !sameCity(input.requestedCity, first.city)
  ) {
    return formatNearestSalonAnswer({
      requestedCity: input.requestedCity,
      alternative: {
        salonName: first.salonName,
        city: first.city,
      },
    });
  }
  if (input.requestedCity) {
    return `Proveravam dostupnost za ${service} u ${cityLocative(input.requestedCity)}.`;
  }
  return `Proveravam dostupnost za ${service}.`;
}
