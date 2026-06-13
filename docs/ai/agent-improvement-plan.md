# Finalni plan: AI agenti za booking bez grešaka (Maria + Claudia)

> Radni dokument — po ovom planu se rešavaju problemi. Redosled faza je potvrđen.
> Cilj: agenti rade pouzdano — bez dead-endova, recovery radi, intent se tačno prepoznaje,
> blokovi renderuju tačno ono što je traženo, "nisam to želeo" ne blokira već ispravlja,
> topao recepcionerski ton, podaci se pripremaju TEK POSLE intenta.

## Arhitektura (verifikovano u kodu)

- **Maria** (ruter): `src/app/api/ai/deepseek-conversation/route.ts`, prompt `src/lib/ai/communication/buildMariaPrompt.ts` — LLM: DeepSeek `deepseek-chat`
- **Claudia** (booking): `src/app/api/ai/conversation/route.ts` → `src/services/askAgent.ts` — LLM: **takođe DeepSeek** (`getDeepseekClient()`)
- **Anthropic** (`claude-haiku-4-5`, raw fetch u `src/lib/ai/anthropic-client.ts`) = SAMO JSON-repair fallback
- Orkestrator (klijent): `src/lib/ai/orchestrator/ai-orchestrator.ts`; klijentski ruter: `src/lib/ai/routing/agentEntryRouter.ts`
- Blokovi: `src/lib/ai/block-registry.ts`, `src/lib/ai/layout/resolveLayout.ts`; memorija toka: `src/lib/ai/booking-flow-state.ts`
- Recovery: `src/lib/ai/recovery/recovery-engine.ts`; podaci: `src/lib/ai/platform-knowledge.ts` (eager, 5 min TTL)

Potvrđeni izvori problema: **routing, intent, data source, dead-endovi**.
Postojeću infrastrukturu (Orchestrator, LayoutEngine, Recovery, Zod šeme, memorije, compacting) PROŠIRUJEMO, ne menjamo.

---

## FAZA 1 — Dead-endovi ⚡

| # | Task | Fajl | Pristup |
|---|------|------|---------|
| 1.1 | Rate-limit poruka umesto praznog `{messages:[]}` (status 200, tišina) | `conversation/route.ts:66-68` + `deepseek-conversation/route.ts` | "Primili smo više zahteva odjednom — sačekajte par sekundi pa pokušajte ponovo." |
| 1.2 | Stale handoff vraća praznu poruku | `askAgent.ts:1538-1551` | Reuse `buildContextPreservingClarification()` (askAgent.ts:390) |
| 1.3 | Unknown intent → generičko "Ne razumem zahtev" bez bloka | `askAgent.ts:1466-1472` | Context-preserving poruka + `chooseBlockForMissingField()` za prvo nedostajuće polje |
| 1.4 | Recovery bez akcije (`missing_contact`/`unknown` samo toast) | `recovery-engine.ts:325,404` | missing_contact → `OPEN_BOOKING_MODAL` sa selectedSlot; unknown → `BOOKING_PAYLOAD_INCOMPLETE` system action |
| 1.5 | Nevalidan blok se tiho preskače | `block-registry.ts:181-207` + LayoutEngine | Fail → recovery event (`missing_salon`/`missing_service`); `requires: ["cities"]` za CityListBlock |
| 1.6 | Timeout 18s: kontradiktoran fallback + fire-and-forget | `ai-orchestrator.ts:236-271` | "Molimo vas sačekajte, proveravamo…"; background rezultat renderuj ILI odbaci ako je flowVersion porastao |

**Verifikacija:** 11 poruka/min → ljubazna poruka; klik na stale salon → smislena poruka; spor odgovor → bez duplih poruka.

## FAZA 2 — Jedan intent leksikon (iz živih podataka) ✅ delom urađeno

Realizovano kao **CatalogContext** (`src/lib/ai/catalog/`): cities + salons + services +
categories + synonyms iz platforme/DB; statična semantička mapa je samo jezički seed.

| # | Task | Status | Realizacija |
|---|------|--------|-------------|
| 2.1 | `CatalogContext` modul | ✅ | `catalog-context.ts` (builder + matcheri: padeži, bez dijakritike, pozicioni matchLastCity), `get-catalog-context.ts` (server, keš po snapshot identitetu), `/api/ai/catalog` + `client-catalog.ts` (klijentska hidracija, localStorage TTL) |
| 2.2 | Zameni hardkodirane liste | ✅ | `agentEntryRouter` (katalog + statični fallback do hidracije), `askAgent`: `detectDirectCity/SalonName/Service`, `extractAskedCity`, `isSalonCityExistenceFollowUp` → `intentCatalogFor()` |
| 2.3 | Detekcija negacije/korekcije (`correction` intent) | ⏳ uz Fazu 4 | `{replace, remove}` semantika ide zajedno sa correction flow-om |
| 2.4 | Unit testovi leksikona | ✅ | `src/tests/catalogContext.test.ts` (12 testova: padeži, dijakritike, DB sinonimi, novi grad/usluga, router integracija) |

Potrošači na jednom izvoru: AgentEntryRouter ✅, parseClaudiaDirectIntent ✅,
Semantic Interpreter ✅ (platformKnowledge = isti izvor), Price/Booking/NotifyMe ✅
(preko parsera), Search normalizacija ✅ (deli `serviceSemanticMap` seed).

**Usput rešena 4 prava buga** (otkrivena u starim testovima):
1. FAQ "da li moram da se registrujem" padao u catch-all "Nešto je zapelo" → deterministička FAQ brza putanja (`detectKnownFaq`, deepseek ruta) sa kanonskim odgovorom iz communication-rules.
2. `inferCityFromSalon` izmišljao grad za nepoznat salon (generička reč "salon" pravila match) → stoplista generičkih tokena.
3. BookingWidget policy dozvoljavao sintetičke slotove (allowSynthetic=true, L6) → strikt: `allowSynthetic:false`, L3 cap, `strictOrigins` za explicit intente (tražena usluga se ne menja drugom kategorijom), trust gate za real availability.
4. Provera dostupnosti bez učitanih podataka tretirana kao "nemamo salon" (shouldHandoff:false) → bez kataloga se ide na handoff Claudiji; činjenični "nemamo" odgovori samo uz učitan katalog.

**Čišćenje testova:** 52 zastarela testa obrisana, 2 krhke asertacije popravljene,
suite zelen: 821/821.

## FAZA 3 — Podaci POSLE intenta ✅ urađeno

| # | Task | Status | Realizacija |
|---|------|--------|-------------|
| 3.1 | Maria prompt na dijeti | ✅ | `buildMariaPrompt.ts`: bez pomenute usluge nema kataloga (ni cena — cenovnik vodi Claudia); sa uslugom top-10 poklapanja (ime\|salon\|grad, bez RSD). Cenovnik primer sada rutira ka Claudii umesto da Maria citira cene |
| 3.2 | Data-prep korak po intentu | ✅ | Direct putanja: leksikon iz JEDNOG keširanog poziva (`fetchBookingSalons`, embedded usluge) → intent → skupi per-salon fetch (`fetchServicesBySalon`, N poziva) SAMO u prices grani. appointments/auth/booking grane više ne plaćaju N poziva. salon_info odgovara činjenično samo uz učitane podatke (inače LLM putanja) |
| 3.2b | Leksikon u guard putanjama | ✅ | `extractAskedCity` i `isSalonCityExistenceFollowUp` primaju snapshot → prepoznaju sve marketplace gradove |
| 3.3 | Server popunjava blokove, ne LLM | ✅ | `enrichClaudiaLayoutBlocks` (askAgent): LLM bira TIP bloka + poruku; server iz platform snapshot-a puni `cities` (matchingCityItems / svi gradovi sa brojem salona) i `salons` (resolveSalonsForService) — izmišljene LLM liste se PREPISUJU. Prompt više ne traži "popuni iz SALONI/GRADOVI sekcije" |
| 3.4 | Svežina podataka | ✅ | `platformClient.ts`: working-hours 3600s→300s, services 60s→30s |

Regression: `src/tests/dataAfterIntent.test.ts` (9 testova: enrichment, prompt bez kataloških
instrukcija, Maria dijeta). Suite zelen: 830/830.

## FAZA 4 — Correction flow ("nisam to želeo" ne blokira) ✅ urađeno

Ključni princip: **ponovni intent PONIŠTAVA prethodni (revoke)** — nova vrednost gazi
staru, negirana vrednost se stvarno briše iz memorije, neodređena korekcija dobija
rezime + pitanje umesto blokade.

| # | Task | Status | Realizacija |
|---|------|--------|-------------|
| 4.1 | `clearFields(keys)` | ✅ | `booking-flow-state.ts` — brisanje po ključu (collect samo merge-uje) |
| 4.2 | `detectDirectCorrection` + obrada | ✅ | `askAgent.ts`: markeri ("nisam to želeo", "ne u X nego Y", "umesto", "promeni", "ipak ne"), semantika replace/remove: ista vrednost uz marker = brisanje, nova = zamena (rep posle pivota ima prednost — "umesto feniranja hoću masažu"). Implicitni revoke: promena grada/usluge briše salonId/serviceId. Zamena → re-dispatch booking sa ispravljenim snapshot-om; `withIntentExtras` ubacuje `cleared`+`corrected` u intent odgovora |
| 4.2b | Klijentski write-back | ✅ | `extractClearedFields` (parseClaudiaResponse) + `useAIQuery`: clearFields PRE collect (stara vrednost ne preživi merge), pa `bumpFlowVersion("correction_cleared")` — blokovi pogrešnog pokušaja postaju stale |
| 4.3 | Neodređena korekcija → rezime | ✅ | "Razumem. Trenutno imam — usluga: X, grad: Y… Šta od toga menjamo: uslugu, grad, salon, datum ili vreme?" |
| 4.4 | Ne resetuj flow na povratku Mariji | ✅ | `handleAgentTransition`: reset SAMO kad je `state === "completed"` (postavlja ga BOOKING_SUBMIT_SUCCESS) |

Zaštita: "otkaži/pomeri termin" NIJE korekcija (operacije nad postojećim terminom).
Testovi: `src/tests/correctionFlow.test.ts` (13). Suite zelen: 843/843.

## FAZA 5 — Persona cleanup ✅ urađeno

| # | Task | Status | Realizacija |
|---|------|--------|-------------|
| 5.1 | Jedinstveni voice guide | ✅ | `AGENT_VOICE_GUIDE` u `agent-communication-rules.ts` (topla recepcionerka hotela 5*, dosledno Vi, ženski rod o sebi, najava provere, greška uvek sa sledećim korakom) — ulazi u communication rules OBA agenta i time u oba prompta |
| 5.1b | Identitet u promptovima | ✅ | Claudia: stari "profesionalan, brz" ton zamenjen toplom recepcionerkom + eksplicitno persiranje; ispravljena i pogrešna instrukcija "Obraćaj se korisniku u ženskom rodu" → "O sebi govoriš u ženskom rodu". Maria: dodato persiranje |
| 5.2 | Sweep hardkodiranih poruka ti→Vi | ✅ | ~30 poruka kroz 10 fajlova: askAgent (sve "Prijavi se/želiš/Izaberi/Reci mi/Najbliže tebi/Možeš..."), orchestrator parse-fallback (i uklonjena zabranjena reč "agent" iz poruke), claudia-contract reset-fallback ("Izvini... napiši" → Vi bez "krenemo ponovo"), parseClaudiaResponse fallback + placeholder, searchFallback, ConversationalSearch, LandingPage, NotifyMeWidget |

Test sync: 7 asertacija ažurirano na Vi forme. Regression: `src/tests/personaVoice.test.ts`
(voice guide u oba prompta, kanonski FAQ u Vi formi). Suite zelen: 848/848.

## FAZA 6 — Episodic DB memory ✅ urađeno

Strukturisane booking/user epizode (NE raw chat, NE PII). Cilj: "Prošli put ste tražili
maderoterapiju u Boru — da proverim Beauty M Glow ponovo?".

| # | Task | Status | Realizacija |
|---|------|--------|-------------|
| 6.1 | `conversationId` | ✅ | `src/lib/ai/memory/conversation-session.ts`: conversationId (sessionStorage, po razgovoru) + guestSessionId (localStorage, stabilan guest identitet za cross-session recall). Šalju se u svaki /api/ai/conversation poziv (useAIQuery); userId server izvodi iz tokena. `resetConversationId()` na /clear (guest identitet ostaje) |
| 6.2 | `AgentEpisode` Mongo model | ✅ | `src/lib/models/AgentEpisode.ts` (kolekcija `agent_episodes`, obrazac AvailabilityWatch): tačno polja iz spec-a (conversationId/userId/guestSessionId/type/outcome/city/service/category/salonId/salonName/date/time/recoveryUsed). Indeksi userId+createdAt, guestSessionId+createdAt; TTL 90 dana. NULA PII/raw poruka kolona |
| 6.3 | Write trigeri (samo važni) | ✅ | Klijent-resolved (POST /api/ai/episodes preko `client-episode-writer` u `recordEpisodicSystemAction`): BOOKING_SUBMIT_SUCCESS, NOTIFY_ME_CREATED, APPOINTMENT_CANCELLED, APPOINTMENT_UPDATED. Server-resolved (askAgent in-process `recordAgentEpisode`, await pre stream-a): PRICE_VIEWED, BOOKING_CONFLICT, NO_SLOTS. Disjunktni skupovi → bez duplih upisa. Dedup prozor 10s, guard: bez recall ključa nema upisa |
| 6.4 | Čitanje u prompt | ✅ | `fetchEpisodicMemory` (po userId, pa guestSessionId) → `episodesToEpisodicMemory` → `buildAgentMemoryContext({episodicMemory})` u glavnoj LLM putanji (zamenjuje server-side prazan in-memory snapshot). Claudia prompt: nova sekcija "PRETHODNE EPIZODE" — proaktivno ponudi nastavak prošlog puta kad memorija prazna; nikad PII |

Arhitektura: epizode su best-effort obogaćivanje — write/read padovi nikad ne ruše booking.
PII bezbednost: model nema kontakt kolone, writer/ruta primaju samo strukturisana polja.
Testovi: `src/tests/episodicDbMemory.test.ts` (8, mockovan Mongo: mapper, dedup, guard, PII). Suite zelen: 856/856.

## FAZA 7 — SSE status events ("Molimo vas sačekajte da proverimo…") ✅ urađeno

Framed SSE protokol izdvojen u `src/lib/ai/sse-frames.ts` (čist modul: encode/reader/status-poruke),
dele ga ruta, klijentski hook i testovi. askAgent ostaje nepromenjen (i dalje vraća one-shot JSON);
uokviravanje je na nivou rute, pa svi postojeći askAgent testovi ostaju validni.

| # | Task | Status | Realizacija |
|---|------|--------|-------------|
| 7.1 | Multi-event stream | ✅ | `/api/ai/conversation` umota askAgent: odmah emituje `data:{type:"status",message}` (flush pre spore `await askAgent`), pa `data:{type:"final",response}`. `statusMessageForIntent` daje intent-aware tekst (termini/cenovnik/rezervacija/izbor/slobodni termini) |
| 7.2 | Klijent: status = transient bubble | ✅ | `useAIQuery` koristi `createClaudiaFrameReader`: status → postojeći streaming bubble (mimo typewriter-a, NE upisuje se u istoriju), final → `fullRaw` za parse/extract. Fallback: neuokvireni JSON (rate-limit/error) ide kroz `rest()` |
| 7.3 | Timeout svestan statusa | ✅ | `claudia-activity.ts` signal; orchestrator `withTimeout`→`withActivityTimeout` (okida tek posle 18s BEZ aktivnosti); klijent zove `markClaudiaActivity()` na svaki okvir → status resetuje budžet i spreči lažni "stuck" fallback |

Test: `src/tests/sseStatusFrames.test.ts` (9: format, reader preko chunk granica, trailing okvir,
fallback, intent poruke, activity signal). Suite zelen: 865/865.

## FAZA 8 — A/B test modela (DeepSeek vs Claude Sonnet 4.6 vs GPT-5.5)

Kriterijumi: razume booking intent, drži kontekst, prati JSON contract, ne halucinira, radi kao agent.

| # | Task | Pristup |
|---|------|---------|
| 8.1 | Model adapter sloj | `LlmAdapter { complete(system, messages, schema?) }`: DeepSeek (postojeći openai klijent), Anthropic (`@anthropic-ai/sdk`, `claude-sonnet-4-6`; opciono `claude-haiku-4-5` za ruter ulogu), OpenAI GPT (model iz env-a). Env: `CLAUDIA_MODEL_PROVIDER/ID`, `MARIA_MODEL_PROVIDER/ID` |
| 8.2 | Claude: structured outputs + caching | `output_config.format` json_schema iz postojećih Zod šema (`zodOutputFormat`) garantuje validan ClaudiaContract → repair nepotreban; `cache_control` na system promptu |
| 8.3 | Golden eval dataset | 40–60 srpskih scenarija: intent, višeturni kontekst, korekcije, padeži, nepostojeći gradovi/usluge (halucinacije) — sa očekivanim intentom/entitetima/blokom |
| 8.4 | Eval harness | `scripts/eval/run-agent-eval.ts`: 3 adaptera × dataset. Metrike: % validan JSON, tačnost intenta/entiteta, hallucination rate (`validateAgentClaim`), latencija p50/p95, cena. Izlaz: md izveštaj |
| 8.5 | Odluka po ulozi | Mogući različiti modeli po agentu. Orijentacija: Sonnet 4.6 $3/$15 MTok, Haiku 4.5 $1/$5; ostale izmeriti |

Napomena: "Claude Sonnet 4" je deprecated — aktuelni ID je `claude-sonnet-4-6`. GPT-5.5 ID kroz env.

---

## Redosled i zavisnosti

1 → 2 (temelj za 4) → 3 → 4 (zavisi od 2.3) → 5 → 6 (zavisi od 6.1) → 7 (menja stream protokol) → 8 (zahteva 8.1; tek kad su popravke unete, da test meri model a ne bagove).

## Verifikacija

1. **Unit:** intent parser (2), clearFields/correction (4), eval harness (8).
2. **Ručni scenariji:** "Hoću masažu u Beogradu sutra" → bez CityList, kalendar; "Nisam to želeo, može u Novom Sadu" → grad zamenjen, ostalo sačuvano; grad iz DB van starog regexa → prepoznat; 11 poruka/min → ljubazna poruka; pitanje za Mariu usred bookinga → bez gubitka.
3. **Prompt regression:** snapshot za buildMariaPrompt/buildClaudiaSystemPrompt.
4. **Eval izveštaj:** model × metrika, preporuka po ulozi.

## Reuse (postojeće funkcije)

`buildContextPreservingClarification` (askAgent.ts:390) · `chooseBlockForMissingField`/`blockHasRequiredMetadata` (block-registry.ts) · `matchingCityItems`/`matchingSalonItems`/`resolveSalonsForService` (booking-block-data.ts) · `sliceFromCollected` (slicePlatformKnowledge.ts) · `buildSemanticMemory`/`buildAgentMemoryContext` (memory/) · `validateAgentClaim` (agent-data-truth-guard.ts) · `formatCommunicationRulesForPrompt` (agent-communication-rules.ts) · rate-limit helper (helpers/rate-limit.ts) · AvailabilityWatch kao obrazac za novu kolekciju
