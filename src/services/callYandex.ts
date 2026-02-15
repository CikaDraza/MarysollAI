// services/callYandex.ts
export async function callYandexGPT(text: string) {
  try {
    const response = await fetch("/api/ai/yandex-conversation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unknown error");

    return data;
  } catch (error) {
    throw error;
  }
}
