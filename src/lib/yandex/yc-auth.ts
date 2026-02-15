import jwt from "jsonwebtoken";

const SERVICE_ACCOUNT_ID = process.env.YC_SERVICE_ACCOUNT_ID!;
const KEY_ID = process.env.YC_KEY_ID!;
const PRIVATE_KEY = process.env.YC_PRIVATE_KEY!.replace(/\\n/g, "\n");

function createJWT(): string {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    aud: "https://iam.api.cloud.yandex.net/iam/v1/tokens",
    iss: SERVICE_ACCOUNT_ID,
    iat: now,
    exp: now + 3600,
  };

  return jwt.sign(payload, PRIVATE_KEY, {
    algorithm: "PS256",
    header: { kid: KEY_ID, alg: "PS256" },
  });
}

export async function getIAMToken(): Promise<string> {
  const jwtToken = createJWT();

  const response = await fetch(
    "https://iam.api.cloud.yandex.net/iam/v1/tokens",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jwt: jwtToken }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("Статус ответа:", response.status);
    console.error("Тело ответа:", data);
    throw new Error(
      `Failed to get IAM token: ${data.error?.message || "Unknown error"}`,
    );
  }

  return data.iamToken;
}
