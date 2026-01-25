// import { layoutSuggestionSchema } from "@/types/ai/schemas";
// import { GoogleGenerativeAI } from "@google/generative-ai";

// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// export async function suggestionAgent(userInput: string) {
//   const currentDate = new Date().toISOString().split("T")[0];
//   const dayOfWeek = new Date().toLocaleDateString("sr-RS", { weekday: "long" });
//   const model = genAI.getGenerativeModel({
//     model: "gemini-2.0-flash",
//     systemInstruction: `
//       You are a Layout Suggestion Engine for Marysoll Makeup studio.
//       Your ONLY job is to decide which UI blocks to show based on user intent.

//       BLOCK DEFINITIONS:
//       - AuthBlock: MUST be shown if user wants to: login, register, sign in, reset password, or if they want to book but are NOT authenticated.
//       - AppointmentCalendarBlock: MUST be shown if user wants to see availability or book a specific time.
//       - ServicesBlock: Shown for "What do you offer?", "Services", etc.

//       DECISION LOGIC:
//       - Intent: "LOGIN/REGISTER" -> [AuthBlock]
//       - Intent: "BOOKING" -> [AuthBlock, AppointmentCalendarBlock] (Always show Auth first if booking is requested)
//       - Intent: "HOW TO BOOK" -> [AuthBlock, AppointmentCalendarBlock] (Don't just explain, SHOW the tools)
//       - Intent: "PRICES/SERVICES" -> [ServicesBlock, ServicePriceBlock]

//       STRICT RULES:
//       - Even if the user asks "How do I...", you MUST provide the relevant block.
//       - For booking requests, ALWAYS include AppointmentCalendarBlock.

//       Current Date: ${currentDate} (${dayOfWeek}).

//       Your task is to extract booking details if provided:
//       - If the user mentions a service (e.g., "manikir", "gel lak"), find its ID/Name.
//       - If the user mentions a time (e.g., "sledeća sreda", "sutra", "u 15h"), convert it to YYYY-MM-DD or HH:mm.

//       Example:
//       User: "Zakazi mi manikir za sledecu sredu"
//       Metadata: { "serviceName": "manikir", "date": "2024-xx-xx" }

//       EXAMPLES:
//       User: "Zelim da se ulogujem"
//       Return: { "type": "layout_suggestion", "blocks": [{ "type": "AuthBlock", "priority": 1 }] }

//       User: "Kako da zakazem?"
//       Return: {
//         "type": "layout_suggestion",
//         "blocks": [
//           { "type": "AuthBlock", "priority": 1 },
//           { "type": "AppointmentCalendarBlock", "priority": 2 }
//         ]
//       }
//       `,
//   });
//   const result = await model.generateContent({
//     contents: [{ role: "user", parts: [{ text: userInput }] }],
//     generationConfig: {
//       responseMimeType: "application/json",
//       responseSchema: layoutSuggestionSchema,
//       temperature: 0.1,
//     },
//   });
//   const responseText = result.response.text();
//   return JSON.parse(responseText);
// }
