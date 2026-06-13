// src/tests/catalogContext.test.ts
//
// Faza 2 — jedan intent leksikon iz živih podataka.
// Sigurnosna mreža: padeži, tekst bez dijakritika, sinonimi iz DB,
// novi marketplace gradovi/usluge koje statični regexi ne znaju.

import {
  buildCatalogContext,
  catalogDataFromPlatformKnowledge,
  cityNameVariants,
  type CatalogData,
} from "@/lib/ai/catalog/catalog-context";
import {
  setClientCatalog,
} from "@/lib/ai/catalog/client-catalog";
import { routeUserMessageToAgent } from "@/lib/ai/routing/agentEntryRouter";

const DATA: CatalogData = {
  cities: [
    { name: "Beograd" },
    { name: "Novi Sad" },
    { name: "Ruma" },
    { name: "Bor" },
    { name: "Leskovac" },
    // Novi marketplace grad — ne postoji ni u jednom statičnom regexu.
    { name: "Zaječar" },
  ],
  salons: [
    { id: "s1", name: "Shi Sham Frizerski Salon", city: "Novi Sad" },
    { id: "s2", name: "Kiki Kiss Beauty", city: "Beograd" },
  ],
  services: [
    // Nova usluga iz DB — statična semantička mapa je ne zna.
    {
      label: "Hidrafacial tretman",
      categoryLabel: "Tretman lica",
      synonyms: ["hidrafacial", "hydrafacial"],
      cities: ["Beograd"],
    },
  ],
  categories: [
    {
      key: "pilates",
      label: "Pilates",
      synonyms: ["reformer"],
      subcategories: [],
    },
  ],
};

const catalog = buildCatalogContext(DATA);

afterEach(() => setClientCatalog(null));

describe("CatalogContext — gradovi (padeži, bez dijakritika)", () => {
  it("cityNameVariants generiše lokativ i genitiv", () => {
    expect(cityNameVariants("Leskovac")).toEqual(
      expect.arrayContaining(["leskovac", "leskovcu", "leskovca"]),
    );
    expect(cityNameVariants("Novi Sad")).toEqual(
      expect.arrayContaining(["novi sad", "novom sadu"]),
    );
    expect(cityNameVariants("Ruma")).toEqual(
      expect.arrayContaining(["ruma", "rumi", "rumu"]),
    );
  });

  it("kratka imena ne dobijaju genitiv (Bor ≠ bore na licu)", () => {
    expect(cityNameVariants("Bor")).not.toContain("bora");
    expect(catalog.matchCity("tretman protiv bora na licu")).toBeUndefined();
  });

  it("prepoznaje grad u lokativu bez dijakritika", () => {
    expect(catalog.matchCity("imate li salon u zajecaru?")).toBe("Zaječar");
    expect(catalog.matchCity("hocu termin u leskovcu")).toBe("Leskovac");
    expect(catalog.matchCity("moze u novom sadu")).toBe("Novi Sad");
  });

  it("matchLastCity vraća grad za koji se pita", () => {
    expect(
      catalog.matchLastCity(
        "Piše da je salon u Beogradu, da li taj salon postoji i u Rumi?",
      ),
    ).toBe("Ruma");
  });
});

describe("CatalogContext — usluge i sinonimi iz DB", () => {
  it("prepoznaje novu DB uslugu koju statična mapa ne zna", () => {
    const match = catalog.matchService("da li radite hidrafacial u beogradu?");
    expect(match?.service).toBe("Hidrafacial tretman");
    expect(match?.category).toBe("Tretman lica");
  });

  it("prepoznaje sinonim kategorije iz DB", () => {
    const match = catalog.matchService("imate li reformer trening?");
    expect(match?.category).toBe("Pilates");
  });

  it("padež usluge se toleriše (masažu → masaža porodica)", () => {
    const match = catalog.matchService("hocu masazu sutra");
    expect(match?.category).toBe("Masaža");
  });
});

describe("CatalogContext — saloni", () => {
  it("prepoznaje salon po distinktivnom tokenu", () => {
    expect(catalog.matchSalon("zanima me Kiki Kiss")?.id).toBe("s2");
  });

  it("generičke reči (salon, frizerski) nisu match", () => {
    expect(catalog.matchSalon("neki nepoznat salon")).toBeUndefined();
  });
});

describe("CatalogContext — adapter iz PlatformKnowledge", () => {
  it("gradi katalog iz platform snapshot oblika", () => {
    const data = catalogDataFromPlatformKnowledge({
      citiesText: "Beograd, Sombor",
      raw: {
        salons: [{ _id: "x1", name: "Glow Studio", city: "Sombor" }],
        services: [{ name: "Pedikir spa", category: "Nokti", city: "Sombor" }],
        categories: [],
      },
    });
    const built = buildCatalogContext(data);
    expect(built.matchCity("termin u somboru")).toBe("Sombor");
    expect(built.matchService("pedikir spa molim")?.service).toBe("Pedikir spa");
  });
});

describe("AgentEntryRouter + CatalogContext", () => {
  it("bez kataloga: nova usluga se ne prepoznaje kao booking", () => {
    setClientCatalog(null);
    const decision = routeUserMessageToAgent({
      message: "Zakaži mi hidrafacial sutra",
      activeAgent: "maria",
    });
    // Booking glagol + vreme i dalje rutira ka booking concierge-u (default),
    // ali signal usluge dolazi tek sa katalogom — proveravamo donji slučaj.
    expect(decision.targetAgent).toBe("claudia");
  });

  it("sa katalogom: nova DB usluga + vreme = direct_booking", () => {
    setClientCatalog(DATA);
    const decision = routeUserMessageToAgent({
      message: "hidrafacial sutra popodne",
      activeAgent: "maria",
    });
    expect(decision.reason).toBe("direct_booking");
    expect(decision.targetAgent).toBe("claudia");
  });
});
