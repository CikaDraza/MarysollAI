import { NextResponse } from "next/server";
import { convertWorkingHours, platformClient } from "@/lib/api/platformClient";
import { findSalonBySlug, normalizeSalonPreview } from "@/lib/salons/salonPreview";

interface Context {
  params: Promise<{ slug: string }>;
}

export async function GET(_req: Request, context: Context) {
  const { slug } = await context.params;

  try {
    // Need the full list to resolve any salon by slug, not just the top 5.
    const rawProfiles = await platformClient.getSalonProfiles({ limit: 200 });
    const rawSalon = findSalonBySlug(rawProfiles, slug);

    if (!rawSalon) {
      return NextResponse.json({ error: "Salon nije pronađen" }, { status: 404 });
    }

    const salonId = rawSalon.id ?? rawSalon._id ?? "";
    const [workingHours, services] = await Promise.allSettled([
      salonId ? platformClient.getSalonWorkingHours(salonId) : Promise.resolve({}),
      salonId ? platformClient.getSalonServices(salonId) : Promise.resolve([]),
    ]);

    const hydratedSalon = {
      ...rawSalon,
      ...(workingHours.status === "fulfilled"
        ? { workingHours: convertWorkingHours(workingHours.value) }
        : {}),
      ...(services.status === "fulfilled" && services.value.length > 0
        ? { services: services.value }
        : {}),
    };

    return NextResponse.json(normalizeSalonPreview(hydratedSalon), {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Greška pri učitavanju salona",
      },
      { status: 500 },
    );
  }
}
