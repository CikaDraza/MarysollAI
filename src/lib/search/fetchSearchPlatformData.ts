import { unstable_cache } from "next/cache";
import {
  platformClient,
  type PlatformSalon,
  type PlatformService,
  type PlatformWorkingHours,
} from "@/lib/api/platformClient";

type SalonProfileParams = {
  city?: string;
  lat?: number;
  lng?: number;
};

function readCacheSeconds(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.round(parsed);
}

export const SEARCH_SALON_PROFILES_CACHE_SECONDS = readCacheSeconds(
  "SEARCH_SALON_PROFILES_CACHE_SECONDS",
  20,
);
export const SEARCH_SALON_SERVICES_CACHE_SECONDS = readCacheSeconds(
  "SEARCH_SALON_SERVICES_CACHE_SECONDS",
  300,
);
export const SEARCH_WORKING_HOURS_CACHE_SECONDS = readCacheSeconds(
  "SEARCH_WORKING_HOURS_CACHE_SECONDS",
  900,
);

async function _fetchSearchSalonProfiles(
  params: SalonProfileParams = {},
): Promise<PlatformSalon[]> {
  return platformClient.getSalonProfiles(params);
}

async function _fetchSearchSalonServices(
  salonId: string,
): Promise<PlatformService[]> {
  return platformClient.getSalonServices(salonId);
}

async function _fetchSearchSalonWorkingHours(
  salonId: string,
): Promise<PlatformWorkingHours> {
  return platformClient.getSalonWorkingHours(salonId);
}

// These wrappers cache above signed platform requests. The platform client
// signs every fetch with a fresh timestamp, so relying only on fetch revalidate
// can still produce one upstream request per user search.
export const fetchSearchSalonProfiles = unstable_cache(
  _fetchSearchSalonProfiles,
  ["search-salon-profiles"],
  {
    revalidate: SEARCH_SALON_PROFILES_CACHE_SECONDS,
    tags: ["platform-search", "platform-search-salons"],
  },
);

export const fetchSearchSalonServices = unstable_cache(
  _fetchSearchSalonServices,
  ["search-salon-services"],
  {
    revalidate: SEARCH_SALON_SERVICES_CACHE_SECONDS,
    tags: ["platform-search", "platform-search-services"],
  },
);

export const fetchSearchSalonWorkingHours = unstable_cache(
  _fetchSearchSalonWorkingHours,
  ["search-salon-working-hours"],
  {
    revalidate: SEARCH_WORKING_HOURS_CACHE_SECONDS,
    tags: ["platform-search", "platform-search-working-hours"],
  },
);
