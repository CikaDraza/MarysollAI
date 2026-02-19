import { formatKnowledgeBase } from "@/lib/ai/formatters";
import { ThreadItem } from "@/types/ai/chat-thread";
import { unifiedSchema } from "@/types/ai/schemas";
import { IAppointment } from "@/types/appointments-type";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function askAgent(
  userInput: string,
  isAuthenticated: boolean,
  history: ThreadItem[],
  userName: string,
) {
  const MAIN_SITE_API = process.env.MAIN_SITE_API;

  // 1. Fetch podataka (paralelno radi brzine)
  const [servicesRes, profileRes, appointmentsRes] = await Promise.all([
    fetch(`${MAIN_SITE_API}/services`, { cache: "no-store" }),
    fetch(`${MAIN_SITE_API}/salon-profile`, { cache: "no-store" }),
    fetch(`${MAIN_SITE_API}/appointments/public`, { cache: "no-store" }),
  ]);

  const servicesData = await servicesRes.json();
  const profileData = await profileRes.json();
  const appointmentsData = await appointmentsRes.json();

  const { servicesText, workingHoursText } = formatKnowledgeBase(
    servicesData,
    profileData,
  );

  // Mapiramo ThreadItem[] u Gemini format (Content[])
  const geminiHistory = history
    .filter((item) => item.type === "message")
    .slice(-6) // Fokus na zadnjih [number] poruka sprečava loop-ove
    .map((item) => ({
      role: item.data.role === "user" ? "user" : "model",
      parts: [{ text: item.data.content }],
    }));

  const busySlotsText = appointmentsData
    .filter((app: IAppointment) => {
      const appDate = new Date(app.date);
      const today = new Date();
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(today.getDate() + 3);
      return (
        appDate <= threeDaysFromNow && app.status !== "appointment_cancelled"
      );
    })
    .slice(0, 10)
    .map((app: IAppointment) => {
      return `${app.date}: od ${app.time} do ${calculateEndTime(app.time, app.duration)}`;
    })
    .join("; ");

  function calculateEndTime(startTime: string, durationMinutes: number) {
    const [hours, minutes] = startTime.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
  }

  const currentDate = new Date().toLocaleDateString("sr-RS", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const BLOCK_REGISTRY_TEXT = `
  - AuthBlock (mode: 'login'|'register'|'logout'): Za prijave, registracije ili odjave. requiresAuth: false.
  - AppointmentCalendarBlock: SMART BOOKING. Popunjavaš metadata: { serviceId, serviceName, date, time }. AKO korisnik nije precizirao sve za metadata popuni sta je raspolozivo i pitaj da unese ono sto fali, npr. uslugu, datum ili vreme. requiresAuth: true.
  - CalendarBlock: Pregled termina (mode: 'list'|'preview'). requiresAuth: true.
  - ServicePriceBlock: Prikaz cenovnika. requiresAuth: false.
  - TestimonialBlock: Utisci. requiresAuth: false.
`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: `
      # ROLE
      Ime: Marysoll. Ton: Profesionalan, ženski rod, duhovit.
      Status: ${isAuthenticated ? `Ulogovan: ${userName}` : "Gost"}.

      # KNOWLEDGE BASE
      - CENOVNIK: ${servicesText}
      - RADNO VREME: ${workingHoursText}
      - ZAUZETO: ${busySlotsText}
      - DANAS JE: ${currentDate}
      - BLOKOVI: ${BLOCK_REGISTRY_TEXT}

      # CRITICAL RULES (MANDATORY)
      1. STATUS PRIORITET: Trenutni status je ${isAuthenticated ? "PRIJAVLJEN" : "GOST"}. Ako je "PRIJAVLJEN", nikada ne nudi AuthBlock(login).
      2. BEZ TEHNIČKOG TEKSTA: U 'content' polju piši samo prirodan tekst. Zabranjeno: "IZVRŠENJE:", "VERBALNA POTVRDA:", "LAYOUT:".
      3. SMART BOOKING: Izračunaj datum u odnosu na ${currentDate}. (npr. sutra, ponedeljak).

      # DECISION MATRIX (IF-THEN-ELSE)
      - IF Korisnik želi zakazivanje:
          * IF Status == "Gost" -> Poruka: "Moraš se prijaviti prvo." + AuthBlock(login).
          * ELSE IF fali podatak (usluga/datum/vreme) -> Poruka: "Popuni u kalendaru..." + AppointmentCalendarBlock(sa dostupnim metadata).
          * ELSE -> Proveri Busy Slots. Ako je slobodno: AppointmentCalendarBlock + Poruka potvrde.
      - IF Korisnik želi cene -> ServicePriceBlock.
      - IF Korisnik želi odjavu -> AuthBlock(logout).
      - IF Korisnik želi reset šifre -> AuthBlock(forgot).
      - IF Korisnik pozdravlja/ćaska -> Samo prirodan odgovor u 'content', layout: "none".

      # SYSTEM EVENTS
      - "USPEŠNA PRIJAVA." -> "Dobrodošla nazad, ${userName}!"
      - "ZAKAZANO." -> "Termin je upisan! Evo liste tvojih termina:" + CalendarBlock(list).
      - "USPEŠNO POSLAT ZAHTEV ZA RESET." -> "Poroverite mejl i pratite instrukcije".
      - "RESETOVAO SAM ŠIFRU." -> "Vrati se u svoj nalog ovde:" + AuthBlock(reset).
      - "USPEŠNO UPISANA NOVA ŠIFRA." -> "Spreman si! Prijavi se:" + AuthBlock(login).

      # OUTPUT FORMAT
      Odgovaraj isključivo validnim JSON-om prema šemi.
    `,
  });

  const result = await model.generateContentStream({
    contents: [
      ...geminiHistory,
      { role: "user", parts: [{ text: userInput }] },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: unifiedSchema,
      temperature: 0.2,
    },
  });

  // Pravimo ReadableStream da bismo slali podatke frontendu čim stignu
  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        controller.enqueue(new TextEncoder().encode(chunkText));
      }
      controller.close();
    },
  });

  return stream;
}
