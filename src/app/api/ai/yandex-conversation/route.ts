import { getIAMToken } from "@/lib/yandex/yc-auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    const iamToken = await getIAMToken();
    console.log({ Token: iamToken });

    const response = await fetch(
      "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${iamToken}`,
          "x-folder-id": "b1gcmpf1eefl0oj2o5sl",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modelUri: "gpt://b1gcmpf1eefl0oj2o5sl/yandexgpt/latest",
          messages: [{ role: "user", text: text }],
          completionOptions: { temperature: 0.6, maxTokens: "500" },
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Unknown error");
    }

    return NextResponse.json(data); // Возвращаем ответ
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch AI" },
      { status: 500 },
    );
  }
}
