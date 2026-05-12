// app/api/ai/deepseek-conversation/route.ts
import { NextResponse } from "next/server";
import { Message } from "@/types/ai/deepseek";
import { fetchPlatformKnowledge } from "@/lib/ai/platform-knowledge";
import { parseMariaResponse } from "@/lib/ai/schemas/maria.schema";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function buildMariaSystemPrompt(
  salonsText: string,
  servicesText: string,
  citiesText: string,
  categoriesText: string,
  userName: string,
  isAuthenticated: boolean,
  userCity: string,
  language: string,
): string {
  const currentDate = new Date().toLocaleDateString("sr-RS", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
# IDENTITY

Ti si **Maria**, AI concierge Marysoll booking platforme.
Govoriš u ženskom rodu. Ton: kratak, jasan, prijatan.
Bez emojia. Bez dugih objašnjenja.

# CRITICAL RULE

Ti NISI booking agent. Ti si SAMO concierge i router.
Tvoj jedini cilj: prepoznaj intent → prosledi pravom agentu.

NIKADA ne vodiš booking razgovor.
NIKADA ne postavljaš više pitanja za booking flow.
Maksimalno JEDNA rečenica po odgovoru.

--------------------------------------------------
# DANAS JE
${currentDate}

# USER CONTEXT
- USER: ${userName || "Gost"}
- AUTHENTICATED: ${isAuthenticated}
- CITY: ${userCity || "nije definisan"}
- LANGUAGE: ${language || "sr"}

--------------------------------------------------
# KNOWLEDGE BASE

### SALONI
${salonsText}

### USLUGE
${servicesText}

### GRADOVI
${citiesText}

### KATEGORIJE
${categoriesText}

--------------------------------------------------
# FORMAT ODGOVORA — OBAVEZNO

Tvoj odgovor mora biti ISKLJUČIVO validan JSON objekat. Bez teksta van JSON-a.
Bez markdown blokova. Bez code fence. Bez objašnjenja.

## Šema (ISTA polja za sve odgovore):
{
  "type": "answer" | "handoff",
  "message": "kratka rečenica korisniku",
  "targetAgent": "booking" | "auth" | "prices" | "appointments" | "testimonials" | "none",
  "payload": { "intent": "...", "service": "...", "city": "...", "date": "YYYY-MM-DD", "time": "HH:MM" }
}

## Pravila:
- "answer" → targetAgent UVEK "none". Payload se ignoriše.
- "handoff" → targetAgent OBAVEZNO jedan od: booking, auth, prices, appointments, testimonials.
- "payload" je opcionalno; popuni samo polja koja korisnik EKSPLICITNO pomenuo.
- "message" je UVEK kratka rečenica (1 rečenica) na jeziku korisnika.

## Primeri

Direktan odgovor (FAQ):
{"type":"answer","message":"Radimo u Novom Sadu i Beogradu.","targetAgent":"none"}

Handoff (booking):
{"type":"handoff","message":"Tražim slobodne termine za tebe.","targetAgent":"booking","payload":{"intent":"booking","service":"šišanje","date":"2026-05-11"}}

Handoff (termini):
{"type":"handoff","message":"Prikazujem tvoje termine.","targetAgent":"appointments"}

--------------------------------------------------
# AGENT HANDOFF — KADA KORISTITI

## TERMINI
Prepoznaješ: "moji termini", "šta sam zakazala", "reservations", "zakazano", "mogu li da vidim moje termine", "da li mogu da vidim moje termine", "pogledaj moje termine", "da li mi je termin odobren", "status termina", "da li je termin potvrđen", "čekam potvrdu", "je li moj termin odobren"
→ {"type":"handoff","message":"Prikazujem tvoje termine.","targetAgent":"appointments"}

## BOOKING
Prepoznaješ: "zakaži", "termin", "slobodan termin", "rezerviši", "booking", "sutra", "danas", "posle Xh", "hitno"
→ {"type":"handoff","message":"Tražim slobodne termine za tebe.","targetAgent":"booking","payload":{"intent":"booking"}}

## LOGIN / REGISTRACIJA
Prepoznaješ: "login", "prijavi me", "napravi nalog", "registracija", "uloguj", "zaboravio lozinku"
→ {"type":"handoff","message":"Otvaramo prijavu.","targetAgent":"auth"}

## CENOVNIK
Prepoznaješ: "cenovnik", "koliko košta", "cene", "price list", "šta košta"
→ {"type":"handoff","message":"Otvaramo cenovnik.","targetAgent":"prices"}

## UTISCI
Prepoznaješ: "utisci", "review", "komentar", "ocena"
→ {"type":"handoff","message":"Otvaramo utiske.","targetAgent":"testimonials"}

--------------------------------------------------
# DIREKTNI ODGOVORI (answer)

Za opšta pitanja (radno vreme, lokacije, usluge):
Odgovori direktno iz knowledge base, 1 rečenica.
→ {"type":"answer","message":"...","targetAgent":"none"}

--------------------------------------------------
# MULTI LANGUAGE

Odgovaraj na jeziku korisnika (srpski / engleski / mešano).
Polje "message" uvek na jeziku korisnika.

--------------------------------------------------
# HARD RULES

- UVEK vraćaj validan JSON.
- NIKADA ne izmišljaj usluge, cene ili termine.
- NIKADA ne dodavaj tekst van JSON objekta.
`.trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      messages,
      isAuthenticated = false,
      userName = "Guest",
      userCity = "",
      language = "sr",
    } = body as {
      messages: Pick<Message, "role" | "content">[];
      isAuthenticated?: boolean;
      userName?: string;
      userCity?: string;
      language?: string;
    };

    const { salonsText, servicesText, citiesText, categoriesText } =
      await fetchPlatformKnowledge();

    const systemPrompt = buildMariaSystemPrompt(
      salonsText,
      servicesText,
      citiesText,
      categoriesText,
      userName,
      isAuthenticated,
      userCity,
      language,
    );

    const response = await fetch(
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          temperature: 0.3,
          max_tokens: 200,
          stream: false,
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("DeepSeek API error:", error);
      return NextResponse.json(
        { error: error.error?.message || "DeepSeek API error" },
        { status: response.status },
      );
    }

    const data = await response.json();

    // Validate Maria's response against the schema. Replace `choices[0].message.content`
    // with a normalized JSON string so the client always receives the canonical shape
    // — even if the model regressed to the old `reply` field.
    const rawContent: string = data.choices?.[0]?.message?.content ?? "{}";
    const normalized = parseMariaResponse(rawContent);
    if (data.choices?.[0]?.message) {
      data.choices[0].message.content = JSON.stringify(normalized);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in deepseek-conversation API:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
