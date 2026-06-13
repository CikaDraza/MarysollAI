// src/lib/ai/sse-frames.ts
//
// Faza 7 — framed SSE protokol za Claudia conversation stream.
// Server šalje "status" okvir (perceptivna latencija) pa "final" okvir sa
// kompletnim ClaudiaResponse-om. Modul je čist (bez I/O, bez React-a) da bi i
// ruta i klijentski hook i testovi delili isti format.

export type ClaudiaStreamFrame =
  | { type: "status"; message: string }
  | { type: "final"; response: unknown };

/** Server: serijalizuje jedan SSE okvir (`data: {...}\n\n`). */
export function encodeSseFrame(payload: ClaudiaStreamFrame): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function parseFrameJson(jsonText: string): ClaudiaStreamFrame | null {
  if (!jsonText) return null;
  let evt: { type?: unknown; message?: unknown; response?: unknown };
  try {
    evt = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (evt.type === "status" && typeof evt.message === "string") {
    return { type: "status", message: evt.message };
  }
  if (evt.type === "final") {
    return { type: "final", response: evt.response ?? {} };
  }
  return null;
}

/** Stateful reader: nahrani chunk-ovima, vrati kompletne okvire kako stižu.
 * `rest()` daje ne-uokvireni ostatak (rate-limit/error odgovori su čist JSON,
 * ne SSE) za fallback parsiranje. */
export function createClaudiaFrameReader() {
  let buffer = "";
  let sawFrame = false;

  const drain = (final: boolean): ClaudiaStreamFrame[] => {
    const frames: ClaudiaStreamFrame[] = [];
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, sep).trim();
      buffer = buffer.slice(sep + 2);
      if (chunk.startsWith("data:")) {
        const frame = parseFrameJson(chunk.slice(5).trim());
        if (frame) {
          sawFrame = true;
          frames.push(frame);
        }
      }
    }
    if (final) {
      const tail = buffer.trim();
      if (tail.startsWith("data:")) {
        const frame = parseFrameJson(tail.slice(5).trim());
        if (frame) {
          sawFrame = true;
          frames.push(frame);
          buffer = "";
        }
      }
    }
    return frames;
  };

  return {
    push(chunk: string): ClaudiaStreamFrame[] {
      buffer += chunk;
      return drain(false);
    },
    flush(): ClaudiaStreamFrame[] {
      return drain(true);
    },
    sawFrame(): boolean {
      return sawFrame;
    },
    /** Leftover unframed text (used as raw JSON fallback when sawFrame=false). */
    rest(): string {
      return buffer;
    },
  };
}

/** Status poruka zavisno od intenta — najava konkretne provere. */
export function statusMessageForIntent(
  handoffPayload: Record<string, unknown> | undefined,
  isBlockInteraction: boolean,
): string {
  const intent =
    typeof handoffPayload?.intent === "string" ? handoffPayload.intent : "";
  if (isBlockInteraction) {
    return "Molimo vas sačekajte, obrađujem vaš izbor…";
  }
  if (intent === "appointments") {
    return "Molimo vas sačekajte, učitavam vaše termine…";
  }
  if (intent === "prices") {
    return "Molimo vas sačekajte, proveravam cenovnik…";
  }
  if (
    intent === "cancel_appointment" ||
    intent === "confirm_cancel_appointment"
  ) {
    return "Molimo vas sačekajte, proveravam vaš termin…";
  }
  if (
    intent === "update_appointment" ||
    intent === "confirm_update_appointment"
  ) {
    return "Molimo vas sačekajte, proveravam izmenu termina…";
  }
  if (intent === "create_booking") {
    return "Molimo vas sačekajte, završavam rezervaciju…";
  }
  return "Molimo vas sačekajte, proveravam slobodne termine…";
}
