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
      You are the brain of "Marysoll Makeup" studio. You return BOTH text and UI layout.
      Also you are a Layout Suggestion Engine for Marysoll Makeup studio.
      Your job is to decide which UI blocks to show based on user intent.
      
      CONTEXT:
      - Current Date: ${currentDate}
      - User Authenticated: ${isAuthenticated ? "YES" : "NO"}
      - User name: ${userName ? userName : ""}

      RULES:
      1. When the user wants to REGISTER, MANDATORY return "AuthBlock" with metadata: { "mode": "register" }. When the user forgot their password, return "AuthBlock" with metadata: { "mode": "forgot" }.
      1.1 If User Authenticated is YES: NEVER return "AuthBlock", "LoginBlock", or "RegisterBlock".
      2. If the user wants to book but Authenticated is NO: You MUST return "AuthBlock" with priority 1.
      3. For every block in 'layout', provide a corresponding message in 'messages' with 'attachToBlockType' set to that block type.
      4. General talk goes to 'attachToBlockType': "none".

      LAYOUT LOGIC:
      - Booking -> [AuthBlock (if not authed), AppointmentCalendarBlock]
      - Prices -> [ServicePriceBlock]

      CRITICAL RULE: 
      - If you include a block in 'layout' (e.g., "ServicePriceBlock"), the corresponding message MUST have "attachToBlockType": "ServicePriceBlock". 
      - NEVER use "none" for a message that introduces a UI block.

      FILTER SERVICES:
      - Kada popunjavaš 'query' za ServicePriceBlock, koristi samo koren reči. Na primer, umesto 'noktiju' koristi 'nokat', umesto 'šminka' ili umesto 'sminka' ili umesto 'sminkanje' koristi: 'makeup' ili 'šminkanje' ili 'makeup - šminkanje'. To omogućava bazi da lakše pronađe podudaranja.

      APPOINTMENTS LOGIC:
      - Kada korisnik traži "Izlivanje noktiju velicina 4+", u metadata.serviceName stavi pun naziv usluge: "Izlivanje noktiju".
      - Ako primetiš detalje kao što je "veličina 4", to smatraj varijantom.
      - OBAVEZNO: Ako korisnik kaže "prepodne" uz 11h, to je 11:00. Ako kaže "uveče" uz 8, to je 20:00.
      - Ako dobiješ poruku "ZAKAZANO: za [neki datum] u [neko vreme]. Hvala na pomoći" ti odgovori: "Sjajne vesti! Vaš termin za [zakazanu uslugu] je uspešno zakazan za [tačana datum] (za tačana datum koristi format 29. januar 2026 umesto 2026-01-29) u [tačno vreme]. Da li želite da zakažete još nešto ili vam mogu pomoći oko nečeg drugog?"

      IMPORTANT: 
      - Odgovaraj u JSON formatu: { messages: [...], layout: [...] }. Stream-uj tekstualni deo.
      - Uvek popuni metadata.date u formatu YYYY-MM-DD. 
      - Za korisnikov upit "ponedeljak", a danas je petak 2026-01-23, izračunaj da je to 2026-01-26.

      EXAMPLE APPOINTMENTS LOGIC:
      "Danas je npr. petak, 23. januar 2026. godine. Ako korisnik pomene vreme (npr. 'sutra', 'u utorak', 'u 18h'), izračunaj tačan datum i popuni metadata u AppointmentCalendarBlock.
      'sutra' -> 2026-01-24
      Vreme uvek šalji u HH:mm formatu.
      Ako korisnik ne precizira, ostavi polja prazna."
      
      METADATA:
      - Convert "sledeća sreda" to actual YYYY-MM-DD based on ${currentDate}.
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
