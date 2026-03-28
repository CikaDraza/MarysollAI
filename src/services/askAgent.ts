// src/services/askAgent.ts
import { ThreadItem } from "@/types/ai/chat-thread";
import { IAppointment } from "@/types/appointments-type";
import { SalonProfile } from "@/types/salon-profile-type";
import { IService } from "@/types/services-type";
import OpenAI from "openai";

// Inicijalizacija DeepSeek klijenta
const deepseek = new OpenAI({
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY_SYSTEM!,
});

// ✅ Bolji helper za ekstrakciju sa logovanjem
function extractArray<T>(data: unknown, context: string): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.data)) {
      return obj.data as T[];
    }
    if (Array.isArray(obj.services)) return obj.services as T[];
    if (Array.isArray(obj.items)) return obj.items as T[];
    if (Array.isArray(obj.appointments)) return obj.appointments as T[];
  }
  console.warn(
    `[askAgent] Could not extract array from ${context}, returning empty`,
  );
  return [];
}

function extractProfile(data: unknown): SalonProfile | null {
  if (!data) return null;
  if (typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;
  // Ako je direktno profil
  if (obj.name && obj.workingHours) return obj as unknown as SalonProfile;
  // Ako je u data property-ju
  if (obj.data && typeof obj.data === "object") {
    const inner = obj.data as Record<string, unknown>;
    if (inner.name && inner.workingHours)
      return inner as unknown as SalonProfile;
  }
  return null;
}

// ✅ Formatiranje radnog vremena za AI
function formatWorkingHours(profile: SalonProfile | null): string {
  if (!profile?.workingHours) return "Radno vreme nije definisano.";

  const days = [
    "Ponedeljak",
    "Utorak",
    "Sreda",
    "Četvrtak",
    "Petak",
    "Subota",
    "Nedelja",
  ];
  const wh = profile.workingHours;

  return days
    .map((day) => {
      const hours = wh[day as keyof typeof wh];
      if (!hours || hours === "Zatvoreno" || hours === "Ne radi") {
        return `${day}: Zatvoreno`;
      }
      return `${day}: ${hours}`;
    })
    .join("\n");
}

// ✅ Formatiranje zauzetih termina sa boljim podacima
function formatBusySlots(appointments: IAppointment[]): string {
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);

  const relevant = appointments
    .filter((app) => {
      const appDate = new Date(app.date);
      return (
        appDate >= today &&
        appDate <= nextWeek &&
        app.status !== "appointment_cancelled"
      );
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (relevant.length === 0)
    return "Svi termini su slobodni za narednih 7 dana.";

  return relevant
    .map((app) => {
      const endTime = calculateEndTime(app.time, app.duration);
      return `${app.date} ${app.time}-${endTime} (${app.serviceName})`;
    })
    .join("; ");
}

function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}

// ✅ Formatiranje usluga sa boljim detaljima
function formatServices(services: IService[]): string {
  if (services.length === 0) return "Nema dostupnih usluga.";

  return services
    .map((s) => {
      const variants =
        s.variants?.map((v) => `${v.name}(${v.price}RSD)`).join(", ") ||
        "Nema varijanti";

      return `- ID:${s._id} | ${s.name} | Kategorija:${s.category} | Osnovna:${s.basePrice}RSD | Trajanje:${s.duration}min | Varijante:[${variants}]`;
    })
    .join("\n");
}

export async function askAgent(
  userInput: string,
  isAuthenticated: boolean,
  history: ThreadItem[],
  userName: string,
) {
  const MAIN_SITE_API = process.env.MAIN_SITE_API;

  // 1. Fetch podataka sa boljim error handlingom
  let servicesData: IService[] = [];
  let profileData: SalonProfile | null = null;
  let appointmentsData: IAppointment[] = [];

  try {
    const [servicesRes, profileRes, appointmentsRes] = await Promise.all([
      fetch(`${MAIN_SITE_API}/services`, { cache: "no-store" }),
      fetch(`${MAIN_SITE_API}/salon-profile`, { cache: "no-store" }),
      fetch(`${MAIN_SITE_API}/appointments/public`, { cache: "no-store" }),
    ]);

    // Proveri response pre parsiranja
    if (!servicesRes.ok)
      console.error("[askAgent] Services fetch failed:", servicesRes.status);
    if (!profileRes.ok)
      console.error("[askAgent] Profile fetch failed:", profileRes.status);
    if (!appointmentsRes.ok)
      console.error(
        "[askAgent] Appointments fetch failed:",
        appointmentsRes.status,
      );

    const servicesRaw = servicesRes.ok ? await servicesRes.json() : [];
    const profileRaw = profileRes.ok ? await profileRes.json() : null;
    const appointmentsRaw = appointmentsRes.ok
      ? await appointmentsRes.json()
      : [];

    servicesData = extractArray<IService>(servicesRaw, "services");
    profileData = extractProfile(profileRaw);
    appointmentsData = extractArray<IAppointment>(
      appointmentsRaw,
      "appointments",
    );
  } catch (error) {
    console.error("[askAgent] Fetch error:", error);
  }

  const servicesText = formatServices(servicesData);
  const workingHoursText = formatWorkingHours(profileData);
  const busySlotsText = formatBusySlots(appointmentsData);

  const currentDate = new Date().toLocaleDateString("sr-RS", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // ✅ Mapiraj istoriju - uključi SISTEMSKE poruke za kontekst
  const deepseekHistory = history
    .filter((item) => item.type === "message")
    .slice(-10) // Povećano na 10 za bolji kontekst
    .map((item) => ({
      role:
        item.data.role === "user" ? ("user" as const) : ("assistant" as const),
      content: item.data.content,
    }));

  const systemPrompt = `
# IDENTITY
Ti si **Claudia Makelele**, specijalizovani AI asistent za zakazivanje termina u Marysoll salonu.
Ime: Claudia Makelele | Uloga: Specijalista za zakazivanje | Ton: Profesionalan, ženski rod, duhovit.

# TRENUTNI KONTEKST
- DANAS JE: ${currentDate}
- KORISNIK: ${isAuthenticated ? `PRIJAVLJEN kao ${userName}` : "GOST (neprijavljen)"}
- STATUS PRIJAVE: ${isAuthenticated ? "AUTHENTICATED" : "UNAUTHENTICATED"}

# KNOWLEDGE BASE - SALON INFO
NAZIV: ${profileData?.name || "Marysoll Salon"}
LOKACIJA: ${profileData?.street || "N/A"}, ${profileData?.city || "N/A"}
TELEFON: ${profileData?.phone || "N/A"}
EMAIL: ${profileData?.email || "N/A"}

# RADNO VREME (STROGO PO OVOM REDOSLEDU)
${workingHoursText}

# USLUGE (ID | Naziv | Kategorija | Cena | Trajanje | Varijante)
${servicesText}

# ZAUZETI TERMINI (narednih 7 dana)
${busySlotsText}

# DOSTUPNI BLOKOVI ZA RENDER
- AuthBlock: Prijava/Registracija/Odjava (mode: login|register|logout|forgot|reset)
- AppointmentCalendarBlock: Zakazivanje termina (ZAHTEVA PRIJAVU!)
- CalendarBlock: Pregled Moji termina (mode: list) ili Kalendar (mode: preview)
- ServicePriceBlock: Cenovnik usluga
- TestimonialBlock: Utisci klijenata | Testimonial | Mogu li da ostavim komentar | Da se zahvalim na usluzi, tretmanu. 

# KRITIČNA PRAVILA

## 1. STATUS AUTENTIKACIJE (NAJVAŽNIJE!)
- AKO je KORISNIK PRIJAVLJEN (${isAuthenticated}): 
  * Koristi ime "${userName}" u obrćanju
  * NIKAD ne nudi AuthBlock(login) ili AuthBlock(register)
  * Može pristupiti CalendarBlock(list) za "Moje termine"
  * Može koristiti AppointmentCalendarBlock za zakazivanje

- AKO je KORISNIK GOST:
  * Za bilo kakvo zakazivanje: "Moraš se prvo prijaviti" + AuthBlock(login)
  * Za pregled termina: "Prijavi se da vidiš svoje termine" + AuthBlock(login)

## 2. "MOJI TERMINI" vs ZAKAZIVANJE
Kada korisnik kaže "Moji termini", "pregledaj termine", "kada imam zakazano":
- AKO PRIJAVLJEN: CalendarBlock(mode: "list") + poruka "Evo tvojih zakazanih termina:"
- AKO GOST: AuthBlock(login) + poruka "Prijavi se da vidiš svoje termine"

## 3. ZAKAZIVANJE - PROVERA DOSTUPNOSTI
Pre nego što potvrdiš zakazivanje:
1. Proveri da li je termin u radnom vremenu
2. Proveri da li se ne preklapa sa ZAUZETIM TERMINIMA iz knowledge base
3. Ako je zauzet: Predloži najbliži slobodan termin
4. Ako je slobodan: AppointmentCalendarBlock sa metadata + poruka potvrde

## 4. SMART BOOKING LOGIKA
- "sutra" = ${new Date(Date.now() + 86400000).toISOString().split("T")[0]}
- "prekosutra" = ${new Date(Date.now() + 172800000).toISOString().split("T")[0]}
- Ako korisnik nije precizirao sve podatke, postavi pitanje pre nego što renderuješ blok

## 5. FORMAT ODGOVORA
Odgovori ISKLJUČIVO u JSON formatu po šemi:
{
  "messages": [{"content": "tekst", "role": "assistant", "attachToBlockType": "none|BlockName"}],
  "layout": [{"type": "BlockName", "priority": 1, "metadata": {...}}]
}

attachToBlockType povezuje poruku sa blokom koji sledi (npr. "AppointmentCalendarBlock").

## 6. SYSTEM EVENTS (prepoznaj ove fraze od korisnika)
- "USPEŠNA PRIJAVA" → "Dobrodošla nazad, ${userName}!"
- "ZAKAZANO" → "Termin je upisan! Evo liste tvojih termina:" + CalendarBlock(list)
- "USPEŠNA ODJAVA" → "Uspešno si se odjavila. Vidimo se uskoro!"
- "USPEŠNO OSTAVLJENA PREPORUKA." → "Super, preporuka upisana. Hvala, to nam pomaže da budemo još bolji!"
`;

  try {
    const stream = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        ...deepseekHistory,
        { role: "user", content: userInput },
      ],
      stream: true,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(new TextEncoder().encode(content));
            }
          }
          controller.close();
        } catch (error) {
          console.error("[askAgent] Stream error:", error);
          controller.error(error);
        }
      },
    });

    return readableStream;
  } catch (error) {
    console.error("[askAgent] DeepSeek API error:", error);
    throw error;
  }
}
