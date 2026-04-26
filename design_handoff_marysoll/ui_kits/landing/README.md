# Marysoll Landing UI Kit

Hi-fi recreation of the **public booking landing** described in `Design_For_Landing.md`. Goal: get a visitor from arrival → confirmed appointment in under 30 seconds.

## Sections (in order)
1. **Header** — logo · theme toggle · language · city · Login
2. **Hero** — H1 *Slobodni termini u salonima danas*, search field, dual CTA
3. **Trust bullets** — four `✔` checkmarks (real-time, no calls, multiple salons, 30s)
4. **Brzi pristup** — four shortcut cards: Masaža · Tretman lica · Šišanje · Nokti
5. **AI section (low priority)** — *Ne znaš šta ti treba?* + *Pitaj asistenta*
6. **Booking widget** — populated form: service, date, time grid, salon name, name + phone for callback
7. **Sticky offer** — bottom-left *⚡ Brzo: prvi slobodan termin u 14:00*
8. **AI drawer** — slides in from the right when "Pitaj asistenta" is clicked

The blog and newsletter sections from the original landing are explicitly removed per the brief.

## Components
- `Header.jsx` — header chrome
- `Hero.jsx` — H1 + search + dual CTA
- `TrustRow.jsx` — `✔` bullets
- `QuickAccess.jsx` — four service shortcut cards
- `AIPrompt.jsx` — low-key AI assistant promo
- `BookingWidget.jsx` — calendar + slot grid + form
- `StickyOffer.jsx` — bottom-left first-slot teaser
- `AIDrawer.jsx` — sliding sidebar chat with Maria Deep
- `index.html` — wires it all together as a click-thru prototype
