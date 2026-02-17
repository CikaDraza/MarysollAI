// app/api/ai/deepseek-conversation/route.ts
import { NextResponse } from "next/server";
import { Message, SendMessageResponse } from "@/types/ai/deepseek";
import { SalonProfile } from "@/types/salon-profile-type";
import { IService } from "@/types/services-type";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Tipovi za interne funkcije
interface SalonKnowledge {
  services: IService[];
  profile: SalonProfile | null;
}

interface AgentCallMetadata {
  type: string;
  originalMessage: string;
  userIntent: string;
}

interface DeepSeekResponse extends SendMessageResponse {
  _agentCall?: AgentCallMetadata;
}

// Funkcija za dobavljanje podataka o salonu
async function getSalonKnowledge(): Promise<SalonKnowledge | null> {
  const MAIN_SITE_API = process.env.MAIN_SITE_API;

  if (!MAIN_SITE_API) {
    console.error("MAIN_SITE_API nije definisan");
    return null;
  }

  try {
    const [servicesRes, profileRes] = await Promise.all([
      fetch(`${MAIN_SITE_API}/services`, { cache: "no-store" }),
      fetch(`${MAIN_SITE_API}/salon-profile`, { cache: "no-store" }),
    ]);

    if (!servicesRes.ok || !profileRes.ok) {
      console.error("Greška pri dobavljanju podataka:", {
        services: servicesRes.status,
        profile: profileRes.status,
      });
      return null;
    }

    const servicesData: IService[] = await servicesRes.json();
    const profileData: SalonProfile = await profileRes.json();

    return {
      services: servicesData,
      profile: profileData,
    };
  } catch (error) {
    console.error("Failed to fetch salon knowledge:", error);
    return null;
  }
}

// System prompt za DeepSeek
function getSystemPrompt(salonData: SalonKnowledge | null): string {
  const services = salonData?.services ?? [];
  const profile = salonData?.profile ?? null;

  const servicesText =
    services.length > 0
      ? services
          .map((service: IService) => {
            if (service.type === "variant" && service.variants?.length) {
              return `- ${service.name} (osnovna cena: ${service.basePrice || "počev od"} RSD, trajanje: ${service.duration} min)`;
            }
            return `- ${service.name}: ${service.price || service.basePrice || "Cena na upit"} RSD (trajanje: ${service.duration} min)`;
          })
          .join("\n")
      : "Trenutno nema dostupnih usluga.";

  const workingHoursText = profile?.workingHours
    ? Object.entries(profile.workingHours)
        .map(([day, hours]) => `${day}: ${hours}`)
        .join(", ")
    : "Radno vreme nije definisano.";

  const currentDate = new Date().toLocaleDateString("sr-RS", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
# ROLE
Ime: Marysoll. Ton: Profesionalan, ženski rod, prijatan i koristan.
Ti si AI asistent za beauty salon koji pomaže klijentima sa informacijama i upućuje ih na drugog asistenta za konkretne akcije.

# KNOWLEDGE BASE - SALON INFO
- NAZIV SALONA: ${profile?.name || "Marysoll Salon"}
- LOKACIJA: ${profile?.street || "Nije definisana"}, ${profile?.city || ""}
- KONTAKT: ${profile?.phone || "Nije definisan"} | ${profile?.email || "Nije definisan"}
- RADNO VREME: ${workingHoursText}
- DANAS JE: ${currentDate}

# USLUGE I CENE
${servicesText}

# TVOJA ULOGA
Ti si prvi kontakt sa korisnikom. Tvoj zadatak je da:
1. Odgovaraš na opšta pitanja o salonu, uslugama, radnom vremenu
2. Prepoznaš kada korisnik želi da izvrši neku AKCIJU (zakazivanje, prijava, pregled termina, cenovnik, utisci)
3. Kada prepoznaš akciju, ti ćeš pozvati specijalizovanog asistenta

# PREPOZNAVANJE AKCIJA
Korisnik može želeti:
- ZAKAZIVANJE: "želim da zakažem", "termin za", "rezerviši", "booking", "zakaži"
- PRIJAVA: "da se prijavim", "login", "uloguj se", "registracija", "napravi nalog"
- CENOVNIK: "cene", "koliko košta", "cenovnik", "price", "spisak usluga"
- TERMINI: "moji termini", "kada sam zakazao", "pregled termina", "moje rezervacije"
- UTISCI: "ostavi utisak", "recenzija", "komentar", "mišljenje", "iskustvo"

# KADA POZVATI DRUGOG ASISTENTA
Kada prepoznaš akciju, odgovori korisniku da ćeš ga povezati sa asistentom koji može da pomogne.
Primer: "Vidim da želiš da zakažeš termin. Povezaću te sa asistentom za zakazivanje koji će ti pomoći."

Zatim u odgovoru dodaj poseban marker: [CALL_AGENT:action_type]

Mogući action_type: 
- "booking" - za zakazivanje
- "auth" - za login/registraciju
- "prices" - za cenovnik
- "appointments" - za pregled termina
- "testimonials" - za utiske

# PRIMERI
Korisnik: "Koje usluge imate?"
Ti: "Imamo širok spektar usluga: šišanje, farbanje, manikir, pedikir... Cene se kreću od 1500 RSD. Želiš li da vidiš kompletan cenovnik? [CALL_AGENT:prices]"

Korisnik: "Želim da zakažem farbanje za sutra u 18h"
Ti: "Sjajno! Povezaću te sa asistentom za zakazivanje koji će proveriti slobodne termine i završiti rezervaciju. [CALL_AGENT:booking]"

# VAŽNA PRAVILA
1. Uvek budi ljubazna i profesionalna
2. Ako ne znaš odgovor, reci da ćeš povezati sa odgovarajućim asistentom
3. Nikada ne izmišljaj informacije - koristi samo knowledge base
4. Za jednostavna pitanja (radno vreme, lokacija, usluge) odgovori direktno
5. Za bilo šta što zahteva akciju, prosledi drugom asistentu
`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, stream = false } = body as {
      messages: Pick<Message, "role" | "content">[];
      stream?: boolean;
    };

    // Dobavi podatke o salonu
    const salonData = await getSalonKnowledge();

    // Kreiraj system prompt sa knowledge base-om
    const systemPrompt = getSystemPrompt(salonData);

    // Proveri da li već postoji system poruka u istoriji
    const hasSystemMessage = messages.some((m) => m.role === "system");

    // Ako nema system poruke, dodaj je na početak istorije
    const fullMessages = hasSystemMessage
      ? messages
      : [
          {
            role: "system" as const,
            content: systemPrompt,
          },
          ...messages,
        ];

    console.log("Sending to DeepSeek with system prompt");

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
          messages: fullMessages,
          temperature: 0.7,
          max_tokens: 2000,
          stream: stream,
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

    // Ako je streaming, prosledi stream odgovor
    if (stream) {
      return new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Inače vrati JSON
    const data = (await response.json()) as DeepSeekResponse;

    const assistantMessage = data.choices[0]?.message?.content;

    if (!assistantMessage) {
      return NextResponse.json(data);
    }

    const agentCallMatch = assistantMessage.match(/\[CALL_AGENT:(\w+)\]/);

    if (agentCallMatch) {
      // Ukloni marker iz poruke
      const cleanMessage = assistantMessage
        .replace(/\[CALL_AGENT:\w+\]/, "")
        .trim();

      data.choices[0].message.content = cleanMessage;

      // Dodaj metapodatke o pozivu agenta
      data._agentCall = {
        type: agentCallMatch[1],
        originalMessage: cleanMessage,
        userIntent: agentCallMatch[1],
      };
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in chat API:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
