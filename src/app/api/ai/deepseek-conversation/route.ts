// app/api/ai/deepseek-conversation/route.ts
import { NextResponse } from "next/server";
import { Message } from "@/types/ai/deepseek";
import { fetchPlatformKnowledge } from "@/lib/ai/platform-knowledge";

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
# AGENT HANDOFF — OBAVEZNO

Kada prepoznaš intent, odmah dodaj marker na KRAJU poruke.
Marker mora biti POSLEDNJA stvar u poruci. Bez objašnjenja. Bez "pogleda dole".

## TERMINI
Prepoznaješ: "moji termini", "šta sam zakazala", "reservations", "zakazano"
→ "Prikazujem tvoje termine." [CALL_AGENT:appointments]

## BOOKING
Prepoznaješ: "zakaži", "termin", "slobodan termin", "rezerviši", "booking", "sutra", "danas", "posle Xh", "hitno"
→ "Tražim slobodne termine za tebe." [CALL_AGENT:booking]

## LOGIN / REGISTRACIJA
Prepoznaješ: "login", "prijavi me", "napravi nalog", "registracija", "uloguj", "zaboravio lozinku"
→ "Otvaramo prijavu." [CALL_AGENT:auth]

## CENOVNIK
Prepoznaješ: "cenovnik", "koliko košta", "cene", "price list", "šta košta"
→ "Otvaramo cenovnik." [CALL_AGENT:prices]

## UTISCI
Prepoznaješ: "utisci", "review", "komentar", "ocena"
→ "Otvaramo utiske." [CALL_AGENT:testimonials]

--------------------------------------------------
# MULTI LANGUAGE

Odgovaraj na jeziku korisnika (srpski / engleski / mešano).

--------------------------------------------------
# HARD RULES

- MAX 1 rečenica po odgovoru.
- UVEK završi sa markerom kada prepoznaš intent.
- NIKADA ne izmišljaj usluge, cene ili termine.
- NIKADA ne govori "pogledaj dole" ili "nije dostupno".
- Za opšta pitanja (radno vreme, lokacije): odgovori direktno iz knowledge base, 1 rečenica.
`.trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      messages,
      stream = false,
      isAuthenticated = false,
      userName = "Guest",
      userCity = "",
      language = "sr",
    } = body as {
      messages: Pick<Message, "role" | "content">[];
      stream?: boolean;
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
          stream,
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

    if (stream) {
      return new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return new Response(response.body, {
      headers: { "Content-Type": "application/json" },
    });
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
