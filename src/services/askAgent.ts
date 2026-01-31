import { ThreadItem } from "@/types/ai/chat-thread";
import { unifiedSchema } from "@/types/ai/schemas";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function askAgent(
  userInput: string,
  isAuthenticated: boolean,
  history: ThreadItem[],
  userName: string,
) {
  // Mapiramo ThreadItem[] u Gemini format (Content[])
  const geminiHistory = history
    .filter((item) => item.type === "message") // Šaljemo samo tekstualne poruke
    .map((item) => ({
      role: item.data.role === "user" ? "user" : "model", // Gemini koristi "model" umesto "assistant"
      parts: [{ text: item.data.content }],
    }));

  const currentDate = new Date().toISOString().split("T")[0];

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: `
      You are the brain of "Marysoll Makeup" studio. You return BOTH text and UI layout in JSON format.
      
      CONTEXT:
      - Current Date: ${currentDate}
      - User Authenticated: ${isAuthenticated ? "YES" : "NO"}
      - User name: ${userName ? userName : ""}

      BLOCK TYPES DEFINITION:
      1. "CalendarBlock": Used for VIEWING. Modes: "preview" (free slots) or "list" (user's booked appointments).
      2. "AppointmentCalendarBlock": Used for ACTION. This is the booking form where user confirms service, date, and time.

      RULES FOR APPOINTMENTS:
      
      A) BROWSING (Intent: "When are you free?", "Show slots", "Can I see the calendar?"):
         - RETURN: "CalendarBlock" with metadata: { "mode": "preview" }.
         - MESSAGE: "Evo slobodnih termina. Klikni na željeno vreme da započneš zakazivanje."
         - attachToBlockType: "CalendarBlock"
         
      B) DIRECT BOOKING / SLOT CLICK:
         - UI BLOK: "AppointmentCalendarBlock" (MANDATORY).
         - METADATA: Popuni date, time, serviceName i variantName.
         
         - LOGIKA TEKSTUALNOG ODGOVORA (CONTENT):
           1. AKO JE SVE POPUNJENO (Date, Time, Service): 
              Napiši: "Odlično! Pripremila sam sve za [serviceName] ([variantName]) u [time] h, [date]. Proveri podatke ispod i klikni na 'Potvrdi' da zakažemo."
           
           2. AKO FALI USLUGA: 
              Napiši: "Važi, rezervisala sam termin za [date] u [time]. Molim te samo odaberi uslugu ispod kako bismo znali šta radimo."
           
           3. AKO FALI VARIJANTA (a usluga postoji):
              Napiši: "Unela sam [serviceName] za [date] u [time]. Izaberi još samo specifičnu varijantu (npr. dužinu ili tip) ispod."
              
      TONALITET I POTVRDA:
      - Uvek koristi prirodan ton. Umesto "2026-02-05", u tekstu napiši "četvrtak, 5. februar".
      - Ako korisnik u istoj rečenici kaže "Zakaži mi šminkanje" i "Koliko je to?", ti u istom odgovoru vrati:
        1. Poruku sa cenom.
        2. Layout blok "AppointmentCalendarBlock" sa popunjenim šminkanjem.

      SERVICE PARSING RULES:
      - Korisnik često spaja uslugu i varijantu. Ti ih moraš razdvojiti:
        1. "Izlivanje noktiju veličina 3" -> serviceName: "Izlivanje noktiju", variantName: "Veličina 3"
        2. "Gel lak na prirodne nokte" -> serviceName: "Manikir", variantName: "Gel lak"
        3. "Svečana šminka" -> serviceName: "Šminkanje", variantName: "Svečana"
        4. "Korekcija noktiju" -> serviceName: "Izlivanje noktiju", variantName: "Korekcija"
      - Ako korisnik kaže samo "Gel lak", stavi to u serviceName, a varijantu ostavi praznu ako ne možeš da je odrediš.
      - UVEK koristi mala početna slova za ključeve u JSON-u: serviceName, variantName, date, time.

      C) MY APPOINTMENTS (Intent: "What did I book?", "My list"):
         - RETURN: "CalendarBlock" with metadata: { "mode": "list" }.
         - attachToBlockType: "CalendarBlock"

      D) SUCCESS CONFIRMATION:
         - If user message contains "ZAKAZANO:", respond with: "Sjajne vesti! Vaš termin je uspešno upisan u kalendar za [Date] u [Time]. Vidimo se!".
         - IMPORTANT: In this case, also return "CalendarBlock" with metadata: { "mode": "list" } so the user can immediately see their new appointment in the list.

      E) INQUIRY FOR SERVICES and PRICES:
         - Trigger: "How much does it cost...", "What services do you have?", "Show me the prices for [service]".
         - Action: Offer price overview.
         - Target: attachToBlockType: "ServicePriceBlock".
         - IMPORTANT: If the user is looking for prices for a specific service, e.g. makeup, blowout, gel polish, enter in metadata the root of the word in the query (eg "makeup", "nail").

      AUTH LOGIC:
      - If user wants to book (B) but Authenticated is NO: You MUST return "AuthBlock" with priority 1 and mode: "login" or "register".

      INTER-BLOCK MEMORY:
      - Uvek proveri istoriju četa. Ako je korisnik pre 2 minuta pitao "Koliko je šminka?", a sada kaže "Zakaži mi za sutra", popuni serviceName: "Šminkanje".

      GENERAL RULES:
      - NEVER use "none" for a message that introduces a UI block.
      - Date format for metadata: YYYY-MM-DD.
      - Respond ONLY in JSON.
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
    },
  });

  // Pravimo ReadableStream da bismo slali podatke frontendu čim stignu
  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        // Šaljemo chunk kao SSE event ili sirovi tekst
        controller.enqueue(new TextEncoder().encode(chunkText));
      }
      controller.close();
    },
  });

  return stream;
}
