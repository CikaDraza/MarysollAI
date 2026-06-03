# Novi salon nevidljiv u booking-u — dijagnoza i ispravke

> Zajednički handoff za **marysoll-booking** (read-only consumer) i
> **marysoll-platform** (source of truth / writes).

## Simptom

Salon **„Miksi Makeup"** (Kruševac, lat `43.570773`, lng `21.328315`, marketplace
vidljiv/odobren, popularnost grada 8) **~2 dana** nije izlazio u `booking.marysoll.com`:

- grad i kategorije Kruševca **su se videli** (padajuća lista),
- ali u `/api/search` i kod AI agenata salon **nije postojao**,
- dok ga `GET /api/salons` (cela lista) i `GET /api/salons?city=Kruševac` **nalaze**.

## Šta je ISKLJUČENO (provereno u kodu platforme)

Prvobitna hipoteza je bila geospatial `$near` upit koji ispušta salone bez 2dsphere
indeksa. **To je netačno:**

- `grep '$near|$geoNear|2dsphere|geoWithin|createIndex'` po `marysoll-platform/src` →
  **nijedan rezultat**. Platforma nema geospatial upit.
- `GET /api/marketplace/salons` filtrira isključivo po
  `{ isDemo:{$ne:true}, marketplaceEnabled:true }` (+ opcioni `city` regex). `lat/lng` se
  koriste **samo** za izračun display `distance` posle upita.
- `resolveSalonLimit` je identičan za oba poziva (200 → 200).

Pošto je upit identičan bez obzira na `lat/lng`, razlika 5-vs-6 salona **nije** mogla doći
sa platforme → uzrok je keš na booking strani. **Ne treba dodavati GeoJSON/2dsphere.**

## Pravi uzrok (dve stvari koje su se sabrale)

1. **Keš fragmentacija po koordinatama (booking).** `/api/search` je salone vukao sa
   `getSalonProfiles({ lat, lng, limit:200 })` → svaki grad (svoje `lat/lng`) je dobijao
   zaseban `unstable_cache` + fetch unos (`/marketplace/salons?lat=…&lng=…`). Retko
   pogađan unos za Kruševac je servirao **stari snapshot** (od pre nego što je salon
   odobren), dok je kanonska lista bez parametara bila sveža.
2. **Webhook je brisao samo katalog gradova (booking).** Platforma poziva
   `revalidateMarketplaceCaches()` na odobravanju, ali je stari
   `POST /api/revalidate-marketplace` radio **samo** `invalidateCityCatalog()` — pa se
   grad+kategorije pojave, ali salon-profili keš i AI baza znanja ostanu zastareli do TTL-a.

## Ispravke

### C — Booking: ne slati lat/lng u salon fetch  ✅ URAĐENO
`src/app/api/search/route.ts` više ne prosleđuje `lat/lng` u `fetchSearchSalonProfiles`
(samo `{ limit:200 }`). Sve pretrage sad dele jedan keš-ključ; rangiranje po udaljenosti
radi se lokalno (haversine sort pre 30-cap-a + `enrichGeoSignals` +
`groupAndSortByCityPriority`).

### B (booking) — webhook briše i prave tagove  ✅ URAĐENO
`POST /api/revalidate-marketplace` sada pored kataloga gradova radi
`revalidateTag(tag, "max")` za `platform-knowledge`, `category-synonyms` i deljeni
`platform-search` (pokriva salon profile + usluge + radno vreme).
> Next 16: `revalidateTag` traži cache-life profil kao 2. argument; `"max"` reprodukuje
> klasični on-demand purge. `updateTag` ne radi u Route Handler-ima.

### B (platforma) — pozvati webhook na SVE marketplace-write događaje
Helper `src/lib/marketplace/revalidateMarketplace.ts` već postoji i poziva se na:
`superadmin/marketplace`, `superadmin/tenants/[tenantId]/marketplace`,
`superadmin/tenants/[tenantId]/demo`. **Rupe koje treba pokriti** (izmena na već
odobrenom salonu se inače ne propagira do TTL-a):

| Događaj | Ruta | Status |
|---------|------|--------|
| Izmena adrese/profila | `api/salon-profile/update` | dodati `revalidateMarketplaceCaches()` |
| Izmena koordinata | `api/superadmin/tenants/[tenantId]/geo-location` (PATCH) | dodati |
| Nova/izmenjena/obrisana usluga (cena) | `api/services/create`, `api/services/[id]/update`, `api/services/[id]/delete` | dodati |

Preduslov: env `BOOKING_REVALIDATE_URL` (→ `https://booking.marysoll.com/api/revalidate-marketplace`)
i `BOOKING_REVALIDATE_SECRET` postavljeni na platformi. Bez njih je helper no-op (oslanja
se na TTL).

### A — geokodiranje + 2dsphere  ❌ NIJE POTREBNO
Premisa je oborena (vidi „Šta je isključeno"). Platforma ne radi geo upit, pa GeoJSON
polje i 2dsphere indeks ne bi ništa rešili — bila bi mrtva kompleksnost u source-of-truth
modelu. Skalarna `lat/lng` polja su dovoljna jer se koriste samo za prikaz/rangiranje.
