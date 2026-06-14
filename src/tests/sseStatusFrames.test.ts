// src/tests/sseStatusFrames.test.ts
//
// Faza 7 — SSE status events. Pokriva: format okvira (status + final),
// streaming reader (deljenje preko chunk granica, trailing okvir bez prazne
// linije), fallback na neuokvireni JSON (rate-limit/error), intent-aware
// status poruke, i activity signal za timeout.

import {
  encodeSseFrame,
  createClaudiaFrameReader,
  statusMessageForIntent,
  type ClaudiaStreamFrame,
} from "@/lib/ai/sse-frames";
import {
  markClaudiaActivity,
  getLastClaudiaActivityAt,
  resetClaudiaActivity,
} from "@/lib/ai/claudia-activity";

function collect(reader: ReturnType<typeof createClaudiaFrameReader>, chunks: string[]) {
  const out: ClaudiaStreamFrame[] = [];
  for (const c of chunks) out.push(...reader.push(c));
  out.push(...reader.flush());
  return out;
}

describe("encodeSseFrame", () => {
  it("kodira data: ...\\n\\n", () => {
    const raw = encodeSseFrame({ type: "status", message: "Molimo vas sačekajte…" });
    expect(raw.startsWith("data: ")).toBe(true);
    expect(raw.endsWith("\n\n")).toBe(true);
    expect(JSON.parse(raw.slice(6).trim())).toEqual({
      type: "status",
      message: "Molimo vas sačekajte…",
    });
  });
});

describe("createClaudiaFrameReader", () => {
  it("čita status pa final okvir", () => {
    const reader = createClaudiaFrameReader();
    const response = { messages: [{ role: "assistant", content: "Evo termina." }], layout: [], intent: {} };
    const frames = collect(reader, [
      encodeSseFrame({ type: "status", message: "Proveravam…" }),
      encodeSseFrame({ type: "final", response }),
    ]);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({ type: "status", message: "Proveravam…" });
    expect(frames[1].type).toBe("final");
    expect((frames[1] as { response: typeof response }).response).toEqual(response);
    expect(reader.sawFrame()).toBe(true);
  });

  it("spaja okvir podeljen preko chunk granice", () => {
    const reader = createClaudiaFrameReader();
    const full = encodeSseFrame({ type: "status", message: "Proveravam slobodne termine…" });
    const mid = Math.floor(full.length / 2);
    const frames = collect(reader, [full.slice(0, mid), full.slice(mid)]);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({ type: "status", message: "Proveravam slobodne termine…" });
  });

  it("flush hvata trailing okvir bez završne prazne linije", () => {
    const reader = createClaudiaFrameReader();
    // bez \n\n na kraju
    const frames = collect(reader, [
      'data: {"type":"final","response":{"messages":[],"layout":[],"intent":{}}}',
    ]);
    expect(frames).toHaveLength(1);
    expect(frames[0].type).toBe("final");
  });

  it("fallback: neuokvireni JSON (rate-limit/error) ostaje u rest(), sawFrame=false", () => {
    const reader = createClaudiaFrameReader();
    const plain = JSON.stringify({ messages: [{ role: "assistant", content: "Previše zahteva." }], layout: [], intent: {} });
    const frames = collect(reader, [plain]);
    expect(frames).toHaveLength(0);
    expect(reader.sawFrame()).toBe(false);
    expect(reader.rest()).toBe(plain);
  });

  it("ignoriše nevalidan JSON u okviru", () => {
    const reader = createClaudiaFrameReader();
    const frames = collect(reader, ["data: {nije-json}\n\n"]);
    expect(frames).toHaveLength(0);
  });
});

describe("statusMessageForIntent", () => {
  it("intent-aware poruke", () => {
    expect(statusMessageForIntent({ intent: "appointments" }, false)).toContain("termine");
    expect(statusMessageForIntent({ intent: "prices" }, false)).toContain("cenovnik");
    expect(statusMessageForIntent({ intent: "create_booking" }, false)).toContain("rezervaciju");
    expect(statusMessageForIntent(undefined, true)).toContain("izbor");
  });

  it("konkretna pretraga termina → 'slobodne termine'", () => {
    expect(
      statusMessageForIntent(undefined, false, "Ima li slobodnih termina sutra?"),
    ).toContain("slobodne termine");
    expect(statusMessageForIntent({ intent: "booking" }, false)).toContain(
      "slobodne termine",
    );
  });

  it("pozdrav / how-to → neutralan filler, NE 'slobodne termine'", () => {
    expect(statusMessageForIntent(undefined, false, "Pozdrav")).not.toContain(
      "slobodne termine",
    );
    const howto = statusMessageForIntent(
      undefined,
      false,
      "Kako mogu da zakažem termin?",
    );
    expect(howto).not.toContain("slobodne termine");
    expect(howto).toBe("Samo trenutak…");
  });

  it("eksplicitni intenti i konkretna pretraga počinju sa 'Molimo vas sačekajte'", () => {
    const cases: Array<[Record<string, unknown> | undefined, boolean, string]> = [
      [{ intent: "appointments" }, false, ""],
      [{ intent: "prices" }, false, ""],
      [{ intent: "create_booking" }, false, ""],
      [undefined, true, ""],
      [undefined, false, "Ima li slobodnih termina?"],
    ];
    for (const [payload, block, msg] of cases) {
      expect(statusMessageForIntent(payload, block, msg)).toMatch(
        /^Molimo vas sačekajte/,
      );
    }
  });
});

describe("claudia-activity (timeout reset signal)", () => {
  it("markClaudiaActivity pomera vreme unapred", () => {
    resetClaudiaActivity();
    const before = getLastClaudiaActivityAt();
    // simuliraj protok vremena bez stvarnog čekanja
    const spy = jest.spyOn(Date, "now").mockReturnValue(before + 5000);
    markClaudiaActivity();
    expect(getLastClaudiaActivityAt()).toBe(before + 5000);
    spy.mockRestore();
  });
});
