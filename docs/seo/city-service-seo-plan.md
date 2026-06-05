# SEO arhitektura: `/[city]/[categorySlug]` stranice

> Status: **PLAN / nije implementirano.** Domen: `https://booking.marysoll.com`.
> Cilj: rangirati programatske *grad × usluga* stranice na Google-u bez duplikata i bez "doorway" kazne.
> Arhitekturno pravilo: `marysoll-booking` je **read-only consumer**. Svi podaci idu preko `platformClient` / API ruta. Ne dupliramo modele/logiku iz `marysoll-platform`.

---

## 1. Problem (potvrđeno u kodu, jun 2026)

- `[categorySlug]` stranica renderuje ceo `LandingPage` sa **hardkodovanim H1** → svaki `/grad/usluga` ima identičan vidljiv sadržaj. Glavni bug.
  - `src/app/[city]/[categorySlug]/page.tsx` → `src/components/landing/LandingPage.tsx` → `Hero.tsx:353` ("Slobodni termini u salonima danas").
- Sve client-side (`"use client"`) → imena salona, cene, slotovi, FAQ nisu u server HTML-u.
- Nema `src/app/[city]/page.tsx` → `/bor` vraća 404.
- Nema `sitemap.ts`, `robots.ts`, JSON-LD.
- `layout.tsx` metadata generička, bez `metadataBase`.
- `salons/[slug]` ima statičnu istu metadata za sve salone (`src/app/salons/[slug]/page.tsx:8`).
- Nema `generateStaticParams`/ISR.
- Routing kolizija: `/[city]` hvata svaki single segment (citiless `/frizura` → `city=frizura`).

Postojeća dobra infra: dinamička `generateMetadata`, `/api/revalidate-marketplace` (on-demand ISR), `platformClient` (server data), `/api/search` (6-nivo fallback slotovi), `/api/salons`, testimonials/ocene (E-E-A-T), `SalonListBlockView` (reusable kartice), editorial teaseri.

---

## 2. Indeksaciona mapa

| URL | Tip | Index? | Canonical |
|---|---|---|---|
| `/` | homepage | index | self |
| `/{grad}` | city hub | index ako ima inventara | self |
| `/{grad}/{usluga}` | **money page** | index ako ima inventara, inače `noindex,follow` | self |
| `/{grad}/{usluga}?after=14&date=tomorrow` | filtrirano stanje | **`noindex,follow`** | `/{grad}/{usluga}` |
| `/salons/{slug}` | salon profil | index (treba dinamička metadata) | self |
| `/usluge/{usluga}` (opciono, Faza 4) | nacionalna kategorija | index | self |

Pravilo: **path = indeksabilna dimenzija; query param = efemerni filter (uvek noindex + canonical na bazu).** Slotovi se menjaju svake minute → vreme/datum nikad ne idu u path.

---

## 3. URL & routing pravila

- City: root `/{grad}` (npr. `/bor`, `/novi-sad`).
- Kategorija-u-gradu: `/{grad}/{usluga}` (npr. `/bor/frizura`).
- **Kolizija rešenje**: citiless kategorija (ako se uopšte pravi) ide pod `/usluge/{usluga}`, NE `/{usluga}`, da se ne sudara sa `/[city]`.
- `[city]/page.tsx` i `[city]/[categorySlug]/page.tsx` moraju **validirati grad** (`STATIC_SERBIAN_CITIES` + live katalog). Nevalidan grad → `notFound()`.
- Slug kategorije validirati protiv `VALID_CATEGORY_SLUGS` (`src/lib/intent/categoryMap.ts`). Nevalidan → `notFound()`.
- City slug normalizacija: `decodeCity` već radi `-` → ` `. Dodati obrnuto (`cityToSlug`) za sitemap/linkove (npr. "Novi Sad" → `novi-sad`, "Niš" → `nis`/`niš`? — odluči: bez dijakritika u slug-u, sa dijakritikom u prikazu).

---

## 4. Rendering model (ključna promena)

```
/[city]/[categorySlug]/page.tsx        ← SERVER component
  ├─ generateStaticParams()             ← top 10 gradova × 8 kategorija ≈ 80 pre-build
  ├─ export const revalidate = 3600     ← ISR; on-demand preko /api/revalidate-marketplace
  ├─ generateMetadata()                 ← dinamički (vidi §5)
  ├─ validacija grada+slug-a → notFound()
  ├─ server-fetch (platformClient): saloni + slot summary + counts + aggregateRating
  ├─ quality gate (vidi §6)
  └─ render:
       <CategorySeoContent .../>        ← SERVER: H1, intro, salon kartice, slične usluge, FAQ, JSON-LD
       <CategoryInteractive .../>       ← CLIENT: postojeci provideri + search bar + BookingWidget + AIDrawer
```

Postojeći client landing se **hidrira povrh** server sadržaja. Provideri (`CityProvider`/`FiltersProvider`/`SearchProvider`/…) seed-uju se preko `initialCity`/`initialCategory`/`initialData`.

Kostur (skica):
```tsx
export default async function CategoryPage({ params, searchParams }) {
  const { city, categorySlug } = await params;
  const cityLabel = decodeCity(city);
  if (!isKnownCity(cityLabel) || !VALID_CATEGORY_SLUGS.has(categorySlug)) notFound();

  const data = await getCategoryPageData(cityLabel, categorySlug); // saloni, slotSummary, counts, rating
  const hasInventory = data.salonCount > 0;

  return (
    <LandingProviders initialCity={cityLabel} initialCategory={categorySlug} initialData={data}>
      <CategorySeoContent city={cityLabel} categorySlug={categorySlug} data={data} indexable={hasInventory} />
      <CategoryInteractive />
    </LandingProviders>
  );
}
```

---

## 5. `generateMetadata` spec (dograditi postojeću)

```ts
const title = `${catLabel} u ${cityLabel} – slobodni termini online | Marysoll`;
const description = `Pronađi slobodne termine za ${catLabel.toLowerCase()} u ${cityLabel}. `
  + `Pogledaj salone, cene i termine, pa rezerviši online bez poziva.`;
const canonical = `https://booking.marysoll.com/${city}/${categorySlug}`;

return {
  title, description,
  alternates: { canonical },
  openGraph: {
    title: `${catLabel} u ${cityLabel} – slobodni termini online`,
    description: `Rezerviši ${catLabel.toLowerCase()} u ${cityLabel} online, bez poziva i čekanja.`,
    url: canonical, siteName: "Marysoll Booking", type: "website",
  },
  twitter: { card: "summary_large_image", title, description },
  robots: hasInventory ? { index: true, follow: true } : { index: false, follow: true },
};
```

- `robots.index` mora zavisiti od **quality gate-a** (ne uvek true).
- Ako su query params prisutni (`after`/`date`) → forsiraj `robots: { index: false, follow: true }` i canonical na base.

---

## 6. Quality gate (anti-doorway) — OBAVEZNO

Stranica je **indeksabilna samo ako**:
- `salonCount >= 1` sa bar jednom uslugom u toj kategoriji, **idealno >= 3** za "preporučene".

Ako prazno:
- `robots: noindex,follow`
- Renderuj koristan prazan ekran: NotifyMe ("Javićemo ti kad se otvori termin za {usluga} u {grad}"), linkove na susedne gradove/kategorije (follow).
- NE renderuj prazne H2 sekcije.

Razlog: Google kažnjava hiljade tankih programatskih stranica bez inventara (doorway).

---

## 7. Sekcije i komponente

| Sekcija | Komponenta | Status |
|---|---|---|
| Header | `LandingHeader` | postoji |
| Hero (dinamički H1) | `Hero` — dodati `title/subtitle/eyebrow` props | izmena |
| Search/filter bar | `Hero` smart input | postoji |
| H2 "Pronađeni termini za {usluga} u {grad}" + slotovi | `BookingWidget` + server slot summary | dograda |
| H2 "Preporučeni saloni za {usluga} u {grad}" | reuse `SalonListBlockView` → `SalonCardsGrid` (server) | dograda |
| H2 "Slične usluge — {grad}" | `RelatedServices` (NOVO) | novo |
| "Još salona u {grad}" (5) | `MoreSalons` (NOVO) | novo |
| "Kasniji termini" (5) | `LaterSlots` (NOVO) | novo |
| NotifyMe | `NotifyMeWidget` | postoji |
| FAQ + `FAQPage` JSON-LD | `CategoryFaq` (NOVO) | novo |
| Blog teaser (3) | `EditorialTeaserSection` filtriran po kategoriji | dograda |
| Footer | `LandingFooter` | postoji |

Redosled: Header → Hero(H1) → search bar → Pronađeni termini → Preporučeni saloni → Slične usluge → Još salona → Kasniji termini → NotifyMe → FAQ → Blog(3) → Footer.

### Novi `Hero` props (Faza 1 — najmanja izmena koja gasi duplikat)
```ts
interface HeroProps {
  eyebrow?: string;   // "Marysoll · Bor"
  title?: ReactNode;  // dinamički H1
  subtitle?: string;  // dinamički paragraf
}
```
Homepage prosleđuje default-e (postojeći tekst); `[categorySlug]` prosleđuje dinamičke.

---

## 8. Dinamički copy generator (`src/lib/seo/categoryCopy.ts`)

Po `(grad, categorySlug)` vraća `{ h1, subtitle, intro, faq }` — sa **pravim brojevima** (broj salona, raspon cena, broj slotova danas) da sadržaj bude jedinstven, ne templejt.

Primeri:

**frizura (hair):**
- H1: `Frizura u {grad} – slobodni termini danas`
- subtitle: `Pronađite slobodne termine za šišanje, feniranje i frizerske usluge u {grad}.`
- intro (sa podacima): `{N} salona u {grad} nudi frizerske usluge, cene od {minCena} RSD. Danas {M} slobodnih termina.`

**manikir (nails):** "Manikir i nokti u {grad} – slobodni termini" / "...gel lak, nadogradnja, pedikir..."

**šminka (makeup):** "Šminkanje u {grad} – rezerviši online" / "...za svadbe, proslave i svaki dan..."

Pravilo: H1 **bez brenda**, prirodan; `<title>` sme imati `| Marysoll`.

Filtrirano stanje (query param aktivan) menja H1/H2 za UX ("...posle 14 časova"), ali stranica je `noindex` + canonical na bazu.

---

## 9. Discovery moduli

- **Slične usluge — {grad}**: linkovi na ostale kategorije u istom gradu (`/{grad}/{drugaUsluga}`). Najjači interni link signal. Po 5.
- **Još salona u {grad}**: saloni van top preporuka, po 5, link na `/salons/{slug}`.
- **Kasniji termini**: po 5. Logika:
  - referentno vreme = trenutak pretrage + 6h.
  - ako je jutro (npr. < 12h) → prikaži popodnevne termine istog dana.
  - ako je popodne → prikaži sutrašnje termine.
  - Koristi `/api/search` slot fallback; ovo je UI modul, ne menja canonical.

---

## 10. FAQ (`CategoryFaq` + `FAQPage` JSON-LD)

3–5 pitanja po (grad, kategorija), sa pravim podacima. Primeri za frizuru u Boru:
- "Koliko košta šišanje u {grad}?" → "Cene kreću od {minCena} RSD, prosek {avgCena} RSD."
- "Mogu li da rezervišem frizera u {grad} za danas?" → "Da, trenutno {M} slobodnih termina."
- "Koji su najbolje ocenjeni frizerski saloni u {grad}?" → nabroji top 3 po oceni.
- "Da li mogu da otkažem termin?" → da, online.

Svaki odgovor mora biti **jedinstven po stranici** (brojevi/imena), ne isti tekst svuda.

---

## 11. JSON-LD šeme (`src/lib/seo/jsonLd.ts`)

Ubaciti u server HTML kao `<script type="application/ld+json">`:

1. **BreadcrumbList**: Početna → {grad} → {usluga}.
2. **ItemList** od `HealthAndBeautyBusiness` (preporučeni saloni) — svaki sa `name`, `address`, `geo`, `priceRange`, `aggregateRating` (ocene postoje preko platformClient), `url` na `/salons/{slug}`.
3. **FAQPage** — iz `CategoryFaq`.
4. (Salon stranica) **HealthAndBeautyBusiness** sa `aggregateRating`, `openingHours`, `priceRange`, `geo`, `address`, `image`.

`aggregateRating` izvor: testimonials/ocene salona (potvrđeno dostupno preko platformClient — proveriti tačno polje pre korišćenja).

---

## 12. Tehnički SEO sloj (globalno, Faza 0)

- `src/app/sitemap.ts` — dinamički: sve validne `grad×usluga` kombinacije **sa inventarom** + city hub-ovi + salon profili + blog. Isključi prazne (quality gate).
- `src/app/robots.ts` — allow sve; `Disallow` faset crawl (`/*?`); link na sitemap.
- `src/app/layout.tsx` — `metadataBase: new URL("https://booking.marysoll.com")`, title template (`%s | Marysoll Booking`), pristojan default description (zameniti "AI Generation web app").
- **Salon stranice**: `src/app/salons/[slug]/page.tsx` → dinamička `generateMetadata` (ime salona, grad, ocena) umesto statične.

---

## 13. Faze (file-level checklista)

**Faza 0 — Tehnički temelj (brzo, visok ROI)**
- [ ] `layout.tsx`: `metadataBase` + default-i + title template
- [ ] `src/app/robots.ts`
- [ ] `src/app/sitemap.ts` (dinamički, gated)
- [ ] `salons/[slug]` dinamička `generateMetadata`

**Faza 1 — Dinamički H1 (gasi glavni duplikat)**
- [ ] `Hero` prima `eyebrow/title/subtitle` props
- [ ] `src/lib/seo/categoryCopy.ts` (copy generator)
- [ ] `[categorySlug]/page.tsx` računa i prosleđuje dinamičke vrednosti
- [ ] homepage prosleđuje default-e

**Faza 2 — SSR shell + quality gate**
- [ ] `getCategoryPageData()` server-fetch (saloni, slotSummary, counts, rating)
- [ ] `CategorySeoContent` (server) + `CategoryInteractive` (client) split
- [ ] quality gate → `robots` gating + prazno stanje
- [ ] `generateStaticParams` + `revalidate`
- [ ] query-param `noindex` + canonical na bazu

**Faza 3 — Discovery + FAQ + JSON-LD**
- [ ] `RelatedServices`, `MoreSalons`, `LaterSlots` (5+5+5)
- [ ] `CategoryFaq`
- [ ] `src/lib/seo/jsonLd.ts` (Breadcrumb + ItemList + FAQPage)
- [ ] blog teaser filtriran po kategoriji

**Faza 4 — City hub + nacionalne kategorije**
- [ ] `src/app/[city]/page.tsx` (city hub + validacija)
- [ ] (opciono) `/usluge/[service]` (reši koliziju, citiless)

---

## 14. Rizici i kako ih izbeći

| Rizik | Mera |
|---|---|
| Doorway / thin pages | Quality gate (§6) — noindex bez inventara |
| Faset eksplozija (URL prostor) | query param uvek noindex + canonical na bazu; robots disallow `/*?` |
| Near-duplicate sadržaj | pravi brojevi/imena/cene po stranici (§8, §10) |
| Stale slotovi u indexu | vreme/datum nikad u path; ISR `revalidate` + on-demand |
| Routing kolizija city vs usluga | validacija + `/usluge/` namespace (§3) |
| CWV/brzina | SSR + ISR + `next/image` |

---

## 15. Merenje uspeha (GSC)

- Coverage: broj indeksiranih `grad×usluga` stranica raste, nula "Duplicate, Google chose different canonical".
- Performance: impresije/klikovi po city×service upitima ("frizura bor", "manikir novi sad").
- Rich results: FAQ + zvezdice (aggregateRating) u SERP-u.
- Core Web Vitals: LCP/CLS zeleno na money pages.
