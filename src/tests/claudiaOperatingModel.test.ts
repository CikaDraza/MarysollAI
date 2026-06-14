// Claudia operating model — task summary + anti-dead-end guard (deterministic).
import { buildClaudiaTaskSummary } from "@/lib/ai/claudia/buildClaudiaTaskSummary";
import { applyAntiDeadEndGuard } from "@/lib/ai/claudia/antiDeadEndGuard";

describe("buildClaudiaTaskSummary", () => {
  it("service known, city missing → booking, next step ask_city", () => {
    const s = buildClaudiaTaskSummary({
      known: { service: "feniranje" },
      directType: "booking",
    });
    expect(s.likelyTask).toBe("booking");
    expect(s.known.service).toBe("feniranje");
    expect(s.missing).toContain("city");
    expect(s.nextBestStep).toBe("ask_city");
  });

  it("service + city known, no salon → show_salons", () => {
    const s = buildClaudiaTaskSummary({
      known: { service: "feniranje", city: "Novi Sad" },
      directType: "booking",
    });
    expect(s.nextBestStep).toBe("show_salons");
    expect(s.missing).not.toContain("city");
  });

  it("price intent with service+city → show_prices", () => {
    const s = buildClaudiaTaskSummary({
      known: { service: "feniranje", city: "Beograd" },
      directType: "prices",
    });
    expect(s.likelyTask).toBe("price");
    expect(s.nextBestStep).toBe("show_prices");
  });

  it("a changed field marks the task as correction", () => {
    const s = buildClaudiaTaskSummary({
      known: { service: "feniranje", city: "Novi Sad" },
      directType: "booking",
      changed: ["city"],
    });
    expect(s.likelyTask).toBe("correction");
    expect(s.changed).toEqual(["city"]);
  });
});

describe("applyAntiDeadEndGuard", () => {
  const summary = buildClaudiaTaskSummary({
    known: { service: "feniranje", city: "Novi Sad" },
    directType: "booking",
  });

  it("empty reply is rewritten", () => {
    const r = applyAntiDeadEndGuard({ messages: [], layout: [] }, { taskSummary: summary });
    expect(r.fixed).toBe(true);
    expect(r.reason).toBe("empty_message");
    expect(r.response.messages?.[0].content?.length).toBeGreaterThan(0);
  });

  it("asking for a city that is already known is rewritten + blocks cleared", () => {
    const r = applyAntiDeadEndGuard(
      {
        messages: [{ role: "assistant", content: "U kom gradu želite termin?" }],
        layout: [{ type: "CityListBlock" }],
      },
      { taskSummary: summary },
    );
    expect(r.fixed).toBe(true);
    expect(r.reason).toBe("asked_known_city");
    expect(r.response.layout).toEqual([]);
  });

  it("repeated question after the user answered it is rewritten", () => {
    // date isn't covered by the direct asked-known check, so it exercises the
    // previous-vs-current repeated-question path.
    const withDate = buildClaudiaTaskSummary({
      known: { service: "feniranje", city: "Novi Sad", date: "2026-06-20" },
      directType: "booking",
    });
    const r = applyAntiDeadEndGuard(
      {
        messages: [{ role: "assistant", content: "Koji datum Vam odgovara?" }],
        layout: [],
      },
      {
        taskSummary: withDate,
        previousAssistantMessage: "Za koji dan da proverim?",
      },
    );
    expect(r.fixed).toBe(true);
    expect(r.reason).toBe("repeated_question_date");
  });

  it("asserting slots with no block is rewritten", () => {
    const r = applyAntiDeadEndGuard(
      {
        messages: [{ role: "assistant", content: "Evo dostupnih termina za Vas." }],
        layout: [],
      },
      { taskSummary: summary },
    );
    expect(r.fixed).toBe(true);
    expect(r.reason).toBe("announced_block_missing");
  });

  it("a healthy reply (asks a genuinely missing field) is left alone", () => {
    const s = buildClaudiaTaskSummary({ known: { service: "feniranje" }, directType: "booking" });
    const r = applyAntiDeadEndGuard(
      { messages: [{ role: "assistant", content: "U kom gradu da proverim termine?" }], layout: [] },
      { taskSummary: s },
    );
    expect(r.fixed).toBe(false);
  });
});
