// src/lib/ai/memory/conversation-session.ts
//
// Faza 6 — identitet za grupisanje epizoda. Dva ID-ja, klijentska strana:
//   - conversationId: po CHAT sesiji (sessionStorage) — grupiše epizode jednog
//     razgovora; nestaje kada se zatvori tab.
//   - guestSessionId: STABILAN po pregledaču (localStorage) — služi da se
//     "prošli put" prepozna i kod gosta koji se vraća u novom razgovoru.
//
// Server izvodi userId iz tokena; klijent ga ne šalje. Ovde NEMA PII —
// samo nasumični identifikatori.

const CONVERSATION_KEY = "marysoll_conversation_id";
const GUEST_SESSION_KEY = "marysoll_guest_session_id";

function randomId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rand}`;
}

function readOrCreate(storage: Storage | null, key: string, prefix: string): string {
  if (!storage) return randomId(prefix);
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const created = randomId(prefix);
    storage.setItem(key, created);
    return created;
  } catch {
    return randomId(prefix);
  }
}

/** Per-tab conversation grouping id. */
export function getConversationId(): string {
  const storage =
    typeof window !== "undefined" ? window.sessionStorage : null;
  return readOrCreate(storage, CONVERSATION_KEY, "conv");
}

/** Long-lived guest identity so a returning guest's episodes are findable. */
export function getGuestSessionId(): string {
  const storage = typeof window !== "undefined" ? window.localStorage : null;
  return readOrCreate(storage, GUEST_SESSION_KEY, "guest");
}

export interface EpisodeIdentity {
  conversationId: string;
  guestSessionId: string;
}

/** Identity sent with every chat request and episode write from the client. */
export function getEpisodeIdentity(): EpisodeIdentity {
  return {
    conversationId: getConversationId(),
    guestSessionId: getGuestSessionId(),
  };
}

/** Starts a fresh conversation grouping (e.g. on /clear). Keeps guest identity
 * so cross-session recall survives. */
export function resetConversationId(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CONVERSATION_KEY, randomId("conv"));
  } catch {
    /* storage unavailable — next getConversationId() makes an ephemeral id */
  }
}
