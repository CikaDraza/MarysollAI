import {
  resolveGeoPriority,
  type GeoSignals,
} from "@/lib/geo/resolveGeoPriority";
import {
  resolveInitialGeoState,
  TRENDING_CITY,
} from "@/lib/geo/resolveInitialGeoState";
import {
  resolveDistanceLocationLabel,
  resolveGeoSourceDisplay,
  resolveSearchLocationLabel,
  resolveUserLocationDisplay,
} from "@/lib/geo/geoSourceDisplay";
import { isSearchEnabled } from "@/hooks/useSearch";
import { resolveIpGeoFromHeaders } from "@/app/api/geo/ip/route";

describe("resolveGeoPriority", () => {
  it("explicit beats gps, saved, ip, and trending", () => {
    const signals: GeoSignals = {
      explicit: { city: "Beograd", lat: 44.8176, lng: 20.4569 },
      gps: { city: "Novi Sad", lat: 45.2671, lng: 19.8335 },
      saved: { city: "Bor" },
      ip: { city: "Niš", lat: 43.3209, lng: 21.8954 },
      trending: { city: TRENDING_CITY },
    };

    expect(resolveGeoPriority(signals)).toMatchObject({
      source: "explicit",
      city: "Beograd",
    });
  });

  it("gps beats saved and ip", () => {
    expect(
      resolveGeoPriority({
        gps: { city: "Novi Sad", lat: 45.2671, lng: 19.8335 },
        saved: { city: "Beograd" },
        ip: { city: "Bor" },
      }),
    ).toMatchObject({ source: "gps", city: "Novi Sad" });
  });

  it("saved beats ip", () => {
    expect(
      resolveGeoPriority({
        saved: { city: "Beograd" },
        ip: { city: "Bor" },
      }),
    ).toMatchObject({ source: "saved", city: "Beograd" });
  });

  it("ip beats trending", () => {
    expect(
      resolveGeoPriority({
        ip: { city: "Bor" },
        trending: { city: TRENDING_CITY },
      }),
    ).toMatchObject({ source: "ip", city: "Bor" });
  });

  it("trending is used when nothing else exists", () => {
    expect(
      resolveGeoPriority({ trending: { city: TRENDING_CITY } }),
    ).toMatchObject({ source: "trending", city: TRENDING_CITY });
  });

  it("ip with city but no coordinates still resolves city", () => {
    expect(resolveGeoPriority({ ip: { city: "Bor" } })).toMatchObject({
      source: "ip",
      city: "Bor",
      lat: undefined,
      lng: undefined,
    });
  });
});

describe("resolveInitialGeoState", () => {
  it("localStorage city becomes saved, not explicit", () => {
    const state = resolveInitialGeoState({ storedCity: "Beograd" });

    expect(state.signals.saved).toEqual({ city: "Beograd" });
    expect(state.signals.explicit).toBeUndefined();
    expect(state.resolved).toMatchObject({ source: "saved", city: "Beograd" });
  });

  it("URL initialCity becomes explicit and ready immediately", () => {
    const state = resolveInitialGeoState({ initialCity: "Novi Sad" });

    expect(state.signals.explicit).toMatchObject({ city: "Novi Sad" });
    expect(state.resolved).toMatchObject({
      source: "explicit",
      city: "Novi Sad",
    });
    expect(state.geoReady).toBe(true);
  });

  it("manual setCity becomes explicit", () => {
    const state = resolveInitialGeoState({
      storedCity: "Beograd",
      manualSelection: "Bor",
    });

    expect(state.signals.explicit).toMatchObject({ city: "Bor" });
    expect(state.signals.saved).toBeUndefined();
    expect(state.resolved).toMatchObject({ source: "explicit", city: "Bor" });
  });

  it("saved plus GPS success resolves to GPS", () => {
    const state = resolveInitialGeoState({
      storedCity: "Beograd",
      gpsResult: { status: "success", lat: 45.2671, lng: 19.8335 },
    });

    expect(state.resolved).toMatchObject({
      source: "gps",
      city: "Novi Sad",
    });
    expect(state.cityToApply).toBe("Novi Sad");
  });

  it("saved plus no GPS plus IP resolves to saved", () => {
    const state = resolveInitialGeoState({
      storedCity: "Beograd",
      gpsResult: { status: "failed" },
      ipResult: { status: "success", city: "Bor" },
    });

    expect(state.resolved).toMatchObject({
      source: "saved",
      city: "Beograd",
    });
    expect(state.geoReady).toBe(true);
  });

  it("no saved plus IP city only applies IP city after GPS is unavailable", () => {
    const state = resolveInitialGeoState({
      gpsResult: { status: "failed" },
      ipResult: { status: "success", city: "Bor", lat: null, lng: null },
    });

    expect(state.resolved).toMatchObject({ source: "ip", city: "Bor" });
    expect(state.cityToApply).toBe("Bor");
    expect(state.geoReady).toBe(true);
  });

  it("no saved plus IP coords snaps to nearest city", () => {
    const state = resolveInitialGeoState({
      gpsResult: { status: "failed" },
      ipResult: { status: "success", lat: 45.2671, lng: 19.8335 },
    });

    expect(state.resolved).toMatchObject({
      source: "ip",
      city: "Novi Sad",
    });
  });

  it("no signals plus timeout uses trending fallback", () => {
    const state = resolveInitialGeoState({
      gpsResult: { status: "failed" },
      ipResult: { status: "failed" },
      timeoutExpired: true,
    });

    expect(state.resolved).toMatchObject({
      source: "trending",
      city: TRENDING_CITY,
    });
    expect(state.geoReady).toBe(true);
  });

  it("late GPS does not override manual explicit", () => {
    const state = resolveInitialGeoState({
      manualSelection: "Beograd",
      gpsResult: { status: "success", lat: 45.2671, lng: 19.8335 },
    });

    expect(state.resolved).toMatchObject({
      source: "explicit",
      city: "Beograd",
    });
  });

  it("late IP does not override manual explicit", () => {
    const state = resolveInitialGeoState({
      manualSelection: "Beograd",
      ipResult: { status: "success", city: "Bor" },
    });

    expect(state.resolved).toMatchObject({
      source: "explicit",
      city: "Beograd",
    });
  });

  it("geoReady is false before resolution", () => {
    expect(resolveInitialGeoState({}).geoReady).toBe(false);
  });

  it("geoReady is true after explicit immediately", () => {
    expect(resolveInitialGeoState({ initialCity: "Bor" }).geoReady).toBe(true);
  });

  it("geoReady is true after timeout", () => {
    expect(resolveInitialGeoState({ timeoutExpired: true }).geoReady).toBe(true);
  });

  it("search is enabled only when geoReady is true and city exists", () => {
    expect(isSearchEnabled({ city: "Beograd", enabled: true })).toBe(true);
    expect(isSearchEnabled({ city: "Beograd", enabled: false })).toBe(false);
    expect(isSearchEnabled({ enabled: true })).toBe(false);
  });
});

describe("api geo ip resolver", () => {
  it("non-RS country returns empty", () => {
    const headers = new Headers({ "x-vercel-ip-country": "DE" });

    expect(resolveIpGeoFromHeaders(headers)).toEqual({
      city: null,
      lat: null,
      lng: null,
    });
  });

  it("RS with lat/lng snaps to nearest Serbian city", () => {
    const headers = new Headers({
      "x-vercel-ip-country": "RS",
      "x-vercel-ip-latitude": "45.2671",
      "x-vercel-ip-longitude": "19.8335",
    });

    expect(resolveIpGeoFromHeaders(headers)).toEqual({
      city: "Novi Sad",
      lat: 45.2671,
      lng: 19.8335,
    });
  });

  it("RS with city only returns matching city", () => {
    const headers = new Headers({
      "x-vercel-ip-country": "RS",
      "x-vercel-ip-city": "Bor",
    });

    expect(resolveIpGeoFromHeaders(headers)).toEqual({
      city: "Bor",
      lat: null,
      lng: null,
    });
  });

  it("invalid headers soft-fail to empty payload", () => {
    const headers = new Headers({
      "x-vercel-ip-country": "RS",
      "x-vercel-ip-latitude": "nope",
      "x-vercel-ip-longitude": "20.0",
      "x-vercel-ip-city": "Unknown",
    });

    expect(resolveIpGeoFromHeaders(headers)).toEqual({
      city: null,
      lat: null,
      lng: null,
    });
  });
});

describe("geo source display", () => {
  it("shows GPS source and derives city from coordinates when city is missing", () => {
    const text = resolveGeoSourceDisplay({
      resolved: {
        source: "gps",
        lat: 45.2671,
        lng: 19.8335,
        available: ["gps"],
      },
      signals: {
        gps: { lat: 45.2671, lng: 19.8335 },
      },
    }).text;

    expect(text).toBe("GPS - Novi Sad");
  });

  it("shows saved location city", () => {
    const text = resolveGeoSourceDisplay({
      resolved: {
        source: "saved",
        city: "Beograd",
        available: ["saved"],
      },
      signals: {
        saved: { city: "Beograd" },
      },
    }).text;

    expect(text).toBe("sačuvana prethodna lokacija - Beograd");
  });

  it("does not append a city for trending", () => {
    const text = resolveGeoSourceDisplay({
      resolved: {
        source: "trending",
        city: TRENDING_CITY,
        available: ["trending"],
      },
      signals: {
        trending: { city: TRENDING_CITY },
      },
    }).text;

    expect(text).toBe("u trendu");
  });

  it("marks poor GPS accuracy as approximate", () => {
    expect(
      resolveUserLocationDisplay({
        origin: {
          source: "gps",
          lat: 45.2671,
          lng: 19.8335,
          city: "Novi Sad",
          accuracyMeters: 12000,
        },
      }),
    ).toBe("približna lokacija - Novi Sad");
  });

  it("shows no user location data when gps/ip are unavailable", () => {
    expect(resolveUserLocationDisplay({})).toBe("vaša lokacija - nema podataka");
  });

  it("distinguishes selected search city from GPS distance origin", () => {
    expect(
      resolveSearchLocationLabel({
        source: "explicit",
        city: "Sremska Mitrovica",
        available: ["explicit", "gps"],
      }),
    ).toBe("Tražimo za: Sremska Mitrovica");
    expect(
      resolveDistanceLocationLabel({
        source: "gps",
        city: "Novi Sad",
        lat: 45.2671,
        lng: 19.8335,
        accuracyMeters: 12000,
      }),
    ).toBe("Udaljenost računamo od približne lokacije: Novi Sad");
  });

  it("labels selected city as distance origin when approximate GPS is ignored", () => {
    expect(
      resolveDistanceLocationLabel({
        source: "city",
        city: "Novi Sad",
        lat: 45.2671,
        lng: 19.8335,
      }),
    ).toBe("Udaljenost računamo od izabrane lokacije: Novi Sad");
  });
});
