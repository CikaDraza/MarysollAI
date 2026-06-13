// GET /api/ai/models
//
// Model Lab — vraća SAMO dostupne modele (računato server-side iz konfigurisanih
// ključeva) + default id. Bez tajni u odgovoru.

import { NextResponse } from "next/server";
import {
  listAvailableModels,
  DEFAULT_MODEL_ID,
} from "@/lib/ai/models/aiModelRegistry";

export async function GET() {
  return NextResponse.json(
    {
      models: listAvailableModels(process.env),
      defaultModelId: DEFAULT_MODEL_ID,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
