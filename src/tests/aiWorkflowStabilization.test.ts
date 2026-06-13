import { readFileSync } from "node:fs";
import path from "node:path";
import { POST } from "@/app/api/ai/deepseek-conversation/route";
import { POST as cancelAppointmentPOST } from "@/app/api/external/appointments/[id]/cancel/route";
import { PUT as updateAppointmentPUT } from "@/app/api/external/appointments/[id]/update/route";
import { askAgent, filterSearchResultByStartHour } from "@/services/askAgent";
import { detectContactInfo } from "@/lib/ai/detectContactInfo";
import { mergeIntentWithConversationContext } from "@/lib/ai/mergeIntentWithConversationContext";
import { parseClaudiaResponse } from "@/lib/ai/parseClaudiaResponse";
import { createThreadItemsFromChatEvent } from "@/lib/ai/createThreadItems";
import {
  legacyActionTextToSystemAction,
  sendSystemAction,
  systemActionToAgentRequest,
} from "@/lib/ai/events/systemActionDispatcher";
import { buildBookingAssistantReply } from "@/lib/ai/buildBookingAssistantReply";
import { extractBookingIntentFromConversation } from "@/lib/ai/extractBookingIntentFromConversation";
import {
  buildBookingContactPayload,
  buildBelgradeStartTime,
  BOOKING_CONFLICT_MESSAGE,
  isBookingInstagramDmEnabled,
  isBookingSmsEnabled,
  isBookingConflict,
  mapBookingErrorMessage,
  normalizeBookingPayload,
  validateContactForm,
  validateBookingPayload,
} from "@/lib/booking/bookingPayload";
import { ClaudiaIntentSchema } from "@/lib/ai/schemas/claudia.schema";
import { mapAppointmentActionError } from "@/lib/api/appointmentActionErrors";
import {
  filterAppointmentsByMode,
  isCancellableAppointment,
  sortAppointmentsByScheduledDesc,
} from "@/lib/appointments/appointmentFilters";
import type { SearchRecoveryState } from "@/types/searchRecovery";
import type { SearchResult } from "@/types/slots";

const selectedSlot: SearchResult = {
  salonId: "salon-1",
  salonName: "Shi Sham Frizerski Salon",
  serviceId: "service-1",
  serviceName: "Feniranje BLOWOUT/WAVES",
  category: "hair",
  startTime: "2026-05-14T14:45:00.000Z",
  city: "Novi Sad",
  price: 1500,
  dateLabel: "Danas",
  timeLabel: "14:45",
  relevanceScore: 100,
  fallbackLevel: 1,
};

async function postMaria(body: Record<string, unknown>) {
  const response = await POST(
    new Request("http://localhost/api/ai/deepseek-conversation", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
  // Phase B SSE — the route now emits a token + done event stream. Tests
  // assert against the structural payload that used to come back as JSON,
  // which now rides on the `done` event.
  if (!response.body) throw new Error("Maria SSE response has no body");
  const raw = await readStream(response.body as ReadableStream<Uint8Array>);
  const frames = raw.split("\n\n");
  for (const frame of frames) {
    const line = frame.trim();
    if (!line.startsWith("data:")) continue;
    const json = line.slice(5).trim();
    if (!json) continue;
    const evt = JSON.parse(json) as { type?: string; payload?: unknown };
    if (evt.type === "done" && evt.payload) {
      // Same untyped shape as the old `response.json()` return — tests
      // access deep fields like `data.aiDebug.replyMode` directly.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return evt.payload as any;
    }
  }
  throw new Error("Maria SSE stream had no done event");
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return full;
    full += decoder.decode(value, { stream: true });
  }
}

describe("AI workflow stabilization", () => {
  it("detects contact from Serbian name and mobile number", () => {
    expect(detectContactInfo({ userMessage: "Milica, 062201787" })).toEqual({
      hasContactInfo: true,
      name: "Milica",
      phone: "062201787",
      email: undefined,
    });
  });

  it("keeps registration-required booking question as FAQ contract", async () => {
    const data = await postMaria({
      messages: [
        { role: "user", content: "Da li moram da se registrujem da zakazem termin?" },
      ],
    });
    const maria = JSON.parse(data.choices[0].message.content);

    expect(maria).toMatchObject({ type: "answer", targetAgent: "none" });
    expect(data.message).toContain("Ne morate");
    expect(data.aiDebug.mariaContract).toMatchObject({
      kind: "faq_answer",
      intent: { domain: "faq", action: "answer_question" },
    });
  });

  it("Claudia search filter never keeps slots before requested start hour", () => {
    const earlySlot: SearchResult = {
      ...selectedSlot,
      startTime: "2026-05-14T14:00:00.000Z",
      timeLabel: "14:00",
    };
    const laterSlot: SearchResult = {
      ...selectedSlot,
      startTime: "2026-05-14T15:30:00.000Z",
      timeLabel: "15:30",
    };

    const filtered = filterSearchResultByStartHour(
      {
        results: [earlySlot, laterSlot],
        slotsByCity: [{ city: "Novi Sad", slots: [earlySlot, laterSlot] }],
        bestSlot: earlySlot,
        fallbackLevel: 0,
        totalSalons: 1,
        debug: {},
      },
      15,
    );

    expect(filtered.results).toHaveLength(1);
    expect(filtered.results[0].timeLabel).toBe("15:30");
    expect(filtered.slotsByCity[0].slots).toHaveLength(1);
    expect(filtered.bestSlot?.timeLabel).toBe("15:30");
  });

  it("Claudia search filter treats 'posle 12' as strictly after 12:00", () => {
    const atNoon: SearchResult = {
      ...selectedSlot,
      startTime: "2026-05-14T12:00:00.000Z",
      timeLabel: "12:00",
    };
    const afterNoon: SearchResult = {
      ...selectedSlot,
      startTime: "2026-05-14T12:30:00.000Z",
      timeLabel: "12:30",
    };

    const filtered = filterSearchResultByStartHour(
      {
        results: [atNoon, afterNoon],
        slotsByCity: [{ city: "Bor", slots: [atNoon, afterNoon] }],
        bestSlot: atNoon,
        fallbackLevel: 0,
        totalSalons: 1,
        debug: {},
      },
      12,
    );

    expect(filtered.results.map((slot) => slot.timeLabel)).toEqual(["12:30"]);
    expect(filtered.bestSlot?.timeLabel).toBe("12:30");
  });

  it("Claudia returns AuthBlock deterministically for login handoff", async () => {
    const stream = await askAgent(
      "Želim da se prijavim da bih nastavila zakazivanje ovog termina.",
      false,
      [],
      "Gost",
      false,
      undefined,
      { intent: "login_for_booking", selectedSlot },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0]).toMatchObject({
      content: "Prijavite se da nastavimo sa zakazivanjem.",
      attachToBlockType: "AuthBlock",
    });
    expect(data.layout[0]).toMatchObject({
      type: "AuthBlock",
      metadata: {
        mode: "login",
        selectedSlot: { serviceName: selectedSlot.serviceName },
      },
    });
  });

  it("Claudia resumes booking after successful login", async () => {
    const stream = await askAgent(
      "USPEŠNA PRIJAVA. Nastavi zakazivanje termina.",
      true,
      [],
      "Milica",
      false,
      undefined,
      { intent: "resume_booking_after_login", selectedSlot },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0]).toMatchObject({
      content: "Uspešno si prijavljena. Nastavljamo sa zakazivanjem.",
      attachToBlockType: "AppointmentCalendarBlock",
    });
    expect(data.layout[0]).toMatchObject({
      type: "AppointmentCalendarBlock",
      metadata: {
        serviceName: selectedSlot.serviceName,
        city: selectedSlot.city,
        time: selectedSlot.timeLabel,
        salonName: selectedSlot.salonName,
      },
    });
  });

  it("SystemActionEvent is never rendered as a user bubble", () => {
    const items = createThreadItemsFromChatEvent({
      type: "system_action",
      action: "SLOT_SELECTED",
      source: "BookingWidget",
      payload: { selectedSlot },
      notifyAgent: false,
      visibleInThread: false,
      timestamp: Date.now(),
    });

    expect(items).toEqual([]);
  });

  it("UserMessageEvent is rendered as a user bubble", () => {
    const items = createThreadItemsFromChatEvent({
      type: "user_message",
      content: "Hoću feniranje sutra.",
      visibleInThread: true,
      timestamp: 1,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "message",
      data: { role: "user", content: "Hoću feniranje sutra." },
    });
  });

  it("AIResponseEvent with visibleInThread=true renders assistant bubble", () => {
    const items = createThreadItemsFromChatEvent({
      type: "ai_response",
      content: "Važi, nastavljamo.",
      visibleInThread: true,
      timestamp: 1,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "message",
      data: { role: "assistant", content: "Važi, nastavljamo." },
    });
  });

  it("AIResponseEvent with visibleInThread=false does not render", () => {
    const items = createThreadItemsFromChatEvent({
      type: "ai_response",
      content: "Hidden debug note.",
      visibleInThread: false,
      timestamp: 1,
    });

    expect(items).toEqual([]);
  });

  it("BOOKING_CONFLICT routes to Claudia with intent booking_conflict", () => {
    const request = systemActionToAgentRequest({
      type: "system_action",
      action: "BOOKING_CONFLICT",
      source: "BookingModal",
      payload: {
        selectedSlot,
        serviceName: selectedSlot.serviceName,
        salonName: selectedSlot.salonName,
        city: selectedSlot.city,
        date: "2026-05-14",
        time: selectedSlot.timeLabel,
      },
      notifyAgent: true,
      visibleInThread: false,
      timestamp: Date.now(),
    });

    expect(request).toMatchObject({
      agentType: "booking",
      handoffPayload: {
        intent: "booking_conflict",
        selectedSlot: { serviceName: selectedSlot.serviceName },
      },
    });
  });

  it("SLOT_SELECTED updates bookingFlow but does not call AI", () => {
    const event = sendSystemAction({
      action: "SLOT_SELECTED",
      source: "BookingWidget",
      payload: { selectedSlot },
      notifyAgent: false,
      visibleInThread: false,
    });

    expect(event?.visibleInThread).toBe(false);
    expect(systemActionToAgentRequest(event!)).toBeNull();
  });

  it("LOGIN_SUCCESS with pending booking routes resume_booking_after_login", () => {
    const request = systemActionToAgentRequest({
      type: "system_action",
      action: "LOGIN_SUCCESS",
      source: "AuthBlock",
      payload: { user: { name: "Milica" }, pendingBooking: selectedSlot },
      notifyAgent: true,
      visibleInThread: false,
      timestamp: Date.now(),
    });

    expect(request).toMatchObject({
      agentType: "booking",
      handoffPayload: {
        intent: "resume_booking_after_login",
        selectedSlot: { serviceName: selectedSlot.serviceName },
      },
    });
  });

  it("Legacy ZAKAZANO maps to BOOKING_SUBMIT_SUCCESS", () => {
    const event = legacyActionTextToSystemAction("ZAKAZANO: za danas u 14:45", "LayoutEngine");

    expect(event).toMatchObject({
      type: "system_action",
      action: "BOOKING_SUBMIT_SUCCESS",
      source: "LayoutEngine",
      visibleInThread: false,
    });
  });

  it("Unknown legacy action logs warning and preserves old behavior", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const event = legacyActionTextToSystemAction("Neka stara akcija", "Unknown");

    expect(event).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[LEGACY_ACTION_TEXT]",
      expect.objectContaining({ preservedOldBehavior: true }),
    );
    warnSpy.mockRestore();
  });

  it("BookingModal conflict does not call askAI with plain text", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/landing/BookingModal.tsx"),
      "utf8",
    );

    expect(source).toContain('action: "BOOKING_CONFLICT"');
    expect(source).not.toContain("askAI(BOOKING_CONFLICT_MESSAGE");
    expect(source).not.toContain("sendToOrchestrator(BOOKING_CONFLICT_MESSAGE");
  });

  it("Claudia preserves service when salon is selected", async () => {
    const stream = await askAgent(
      "Izabrao sam salon: Shi Sham Frizerski Salon [salonId:69] u Novi Sad",
      false,
      [],
      "Gost",
      false,
      { service: "Feniranje STRAIGHT", city: "Novi Sad", time: "13:00" },
      {
        intent: "select_salon",
        city: "Novi Sad",
        service: "Feniranje STRAIGHT",
        salonId: "69",
        salonName: "Shi Sham Frizerski Salon",
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0].content).toContain("Feniranje STRAIGHT");
    expect(data.layout[0]).toMatchObject({
      type: "AppointmentCalendarBlock",
      metadata: {
        service: "Feniranje STRAIGHT",
        city: "Novi Sad",
        salonId: "69",
        salonName: "Shi Sham Frizerski Salon",
      },
    });
  });

  it("empty-stream fallback preserves context and asks for a simple retry (no reset)", () => {
    const parsed = parseClaudiaResponse("");

    // New behavior (Phase D): never tell the user to start over. The server now
    // validates/repairs/recovers, so this client fallback only fires on a
    // dropped connection — it must reassure that memory is kept.
    expect(parsed.messages[0].content).not.toContain("krenemo ponovo");
    expect(parsed.messages[0].content).not.toContain(
      "napiši koju uslugu želiš, u kom gradu i u koje vreme",
    );
    expect(parsed.messages[0].content.toLowerCase()).toContain("pamtim");
    expect(parsed.layout).toEqual([]);
  });

  it("preserves effective city and service after user accepts recovery city", () => {
    const lastRecoveryState: SearchRecoveryState = {
      requestedCity: "Beograd",
      effectiveCity: "Novi Sad",
      recoveryScenario: "exact_in_nearest_city",
      exactMatchFound: true,
      exactMatchInRequestedCity: false,
      exactMatchInNearestCity: true,
      relatedMatchFound: false,
      relatedMatchInRequestedCity: false,
      relatedMatchInNearestCity: false,
      selectedCityHasResults: true,
      nearbyCitySuggestions: [],
      userMessage: "Nema feniranja u Beogradu.",
    };

    const merged = mergeIntentWithConversationContext({
      latestUserText: "U redu, može u Novom Sadu.",
      rawExtractedIntent: {},
      lastIntent: { service: "feniranje", requestedCity: "Beograd", city: "Beograd" },
      lastRecoveryState,
    });

    const reply = buildBookingAssistantReply({
      intent: merged,
      searchResult: {
        results: [selectedSlot],
        slotsByCity: [],
        bestSlot: selectedSlot,
        fallbackLevel: 1,
        totalSalons: 1,
        debug: {},
        recoveryState: {
          ...lastRecoveryState,
          requestedCity: "Novi Sad",
          effectiveCity: "Novi Sad",
          recoveryScenario: "exact_in_requested_city",
          exactMatchInRequestedCity: true,
        },
      },
    });

    expect(merged).toMatchObject({ service: "feniranje", requestedCity: "Novi Sad" });
    expect(reply.text).not.toContain("Nema feniranja u Beogradu");
  });

  it("mounts AgentBridge on the landing page branch", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/landing/LandingPage.tsx"),
      "utf8",
    );

    expect(source).toContain("<LandingAgentBridge>");
    expect(source).toContain("<AgentBridge claudiaAskAI={invokeClaudia}>{children}</AgentBridge>");
  });

  it("uses contextual login request from booking modal", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/landing/BookingModal.tsx"),
      "utf8",
    );

    expect(source).toContain("persistPendingBooking(slot)");
    expect(source).toContain('action: "LOGIN_REQUIRED"');
    expect(source).toContain('source: "BookingModal"');
    expect(source).not.toContain('sendMessage("Prijavi se")');
  });

  it("AgentBridge passes original user message to Claudia", () => {
    const seekSource = readFileSync(
      path.join(process.cwd(), "src/hooks/useChatSeek.ts"),
      "utf8",
    );
    const bridgeSource = readFileSync(
      path.join(process.cwd(), "src/components/chat-bus/AgentBridge.tsx"),
      "utf8",
    );

    expect(seekSource).toContain("originalUserMessage: newMessage");
    expect(seekSource).toContain("history: updatedMessages");
    expect(bridgeSource).toContain("originalUserMessage ||");
    expect(bridgeSource).toContain("await askAI(originalUserQuery");
  });

  it("authenticated booking modal pre-fills name", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/landing/BookingModal.tsx"),
      "utf8",
    );

    expect(source).toContain("setFormName(user?.name ?? \"\")");
    expect(source).toContain("setFormPhone(getUserPhone(user))");
    expect(source).toContain("setFormEmail(user?.email ?? \"\")");
    expect(source).toContain("[BOOKING_PREFILL]");
  });

  it("login resumes pending booking slot", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/blocks/LoginBlockView.tsx"),
      "utf8",
    );

    expect(source).toContain("pendingSlot");
    expect(source).toContain("consumePendingBooking()");
    expect(source).toContain("[AUTH_RESUME]");
    expect(source).toContain('action: "LOGIN_SUCCESS"');
    expect(source).not.toContain("openModal(selectedSlot)");
  });

  it("selectedSlot with date and time computes startTime", () => {
    const normalized = normalizeBookingPayload({
      salonId: "salon-1",
      salonName: "Kiki Kiss Beauty",
      serviceId: "service-1",
      serviceName: "Šminkanje",
      city: "Beograd",
      category: "makeup",
      date: "2026-05-17",
      time: "14:30",
      duration: 60,
      price: 2800,
    });

    expect(normalized?.startTime).toBe(buildBelgradeStartTime("2026-05-17", "14:30"));
    expect(validateBookingPayload(normalized).ok).toBe(true);
  });

  it("selectedSlot missing salonId does not validate for submit", () => {
    const normalized = normalizeBookingPayload({
      salonName: "Kiki Kiss Beauty",
      serviceId: "service-1",
      serviceName: "Šminkanje",
      city: "Beograd",
      date: "2026-05-17",
      time: "14:30",
      duration: 60,
      price: 2800,
    });
    const validation = validateBookingPayload(normalized);

    expect(validation.ok).toBe(false);
    expect(validation.missingFields).toContain("salonId");
    expect(validation.recoverable).toBe(true);
  });

  it("selectedSlot missing salonId triggers salon recovery in modal context", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/context/landing/BookingModalContext.tsx"),
      "utf8",
    );

    expect(source).toContain("handleRecoveryEvent");
    expect(source).toContain('reason: RecoveryReason =');
    expect(source).toContain('"missing_salon"');
    expect(source).toContain("setModalSlot(null)");
  });

  it("duplicate Claudia message is suppressed in thread state layer", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/hooks/useAIQuery.ts"),
      "utf8",
    );

    expect(source).toContain("suppressDuplicateAssistantMessages");
    expect(source).toContain("<= 2_000");
  });

  it("API missing salon/startTime error maps to Serbian recovery message", () => {
    expect(mapBookingErrorMessage("salonId and startTime are required")).toBe(
      "Nedostaje salon ili termin. Pokušavam da pronađem odgovarajući salon.",
    );
  });

  it("platform required phone error maps to a clean Serbian toast message", () => {
    expect(
      mapBookingErrorMessage('Platform API 400: {"error":"Ime i telefon su obavezni"}'),
    ).toBe("Unesite telefon, email ili Instagram da salon može da potvrdi termin.");
  });

  it("authenticated user can submit contact payload without phone or instagram", () => {
    const validation = validateContactForm({
      isAuthenticated: true,
      form: { name: "Milica", email: "milica@example.com" },
    });
    const payload = buildBookingContactPayload({
      user: {
        id: "user-1",
        email: "milica@example.com",
        name: "Milica",
        isAdmin: false,
        token: "token",
      },
      form: { name: "Milica", email: "milica@example.com" },
    });

    expect(validation.ok).toBe(true);
    expect(payload).toMatchObject({
      clientId: "user-1",
      clientName: "Milica",
      clientEmail: "milica@example.com",
      preferredContact: "email",
    });
    expect(payload.contactNote).toContain("email adrese");
    expect(payload.clientPhone).toBeUndefined();
    expect(payload.clientInstagram).toBeUndefined();
  });

  it("authenticated user phone is included from profile when available", () => {
    const payload = buildBookingContactPayload({
      user: {
        id: "user-1",
        email: "milica@example.com",
        name: "Milica",
        isAdmin: false,
        token: "token",
        phone: "0601234567",
      },
      form: { name: "Milica", email: "milica@example.com" },
    });

    expect(payload.clientPhone).toBe("0601234567");
    expect(payload.preferredContact).toBe("email");
  });

  it("authenticated user with phone still prefers email when SMS is not enabled", () => {
    const payload = buildBookingContactPayload({
      user: {
        id: "user-1",
        email: "milica@example.com",
        name: "Milica",
        isAdmin: false,
        token: "token",
        phone: "0601111111",
      },
      form: { name: "Milica", phone: "0602222222", email: "milica@example.com" },
    });

    expect(payload.clientPhone).toBe("0602222222");
    expect(payload.preferredContact).toBe("email");
    expect(payload.contactNote).toContain("email adrese");
  });

  it("authenticated user with Instagram still prefers email when Instagram DM is not enabled", () => {
    const payload = buildBookingContactPayload({
      user: {
        id: "user-1",
        email: "milica@example.com",
        name: "Milica",
        isAdmin: false,
        token: "token",
      },
      form: { name: "Milica", instagram: "@milica", email: "milica@example.com" },
    });

    expect(payload.clientInstagram).toBe("@milica");
    expect(payload.preferredContact).toBe("email");
    expect(payload.contactNote).toContain("email adrese");
  });

  it("booking SMS and Instagram DM capabilities are disabled by default", () => {
    expect(isBookingSmsEnabled()).toBe(false);
    expect(isBookingInstagramDmEnabled()).toBe(false);
  });

  it("guest without contact cannot submit contact form", () => {
    const validation = validateContactForm({
      isAuthenticated: false,
      form: { name: "Ana" },
    });

    expect(validation).toEqual({
      ok: false,
      message: "Unesite telefon, email ili Instagram da salon može da potvrdi termin.",
    });
  });

  it("guest with phone can submit contact payload", () => {
    const validation = validateContactForm({
      isAuthenticated: false,
      form: { name: "Ana", phone: "0601234567" },
    });
    const payload = buildBookingContactPayload({
      form: { name: "Ana", phone: "0601234567" },
    });

    expect(validation.ok).toBe(true);
    expect(payload).toMatchObject({
      clientName: "Ana",
      clientPhone: "0601234567",
      preferredContact: "phone",
    });
  });

  it("guest with email can submit contact payload", () => {
    const validation = validateContactForm({
      isAuthenticated: false,
      form: { name: "Ana", email: "ana@example.com" },
    });
    const payload = buildBookingContactPayload({
      form: { name: "Ana", email: "ana@example.com" },
    });

    expect(validation.ok).toBe(true);
    expect(payload).toMatchObject({
      clientEmail: "ana@example.com",
      preferredContact: "email",
    });
  });

  it("guest with Instagram can submit and payload includes clientInstagram", () => {
    const validation = validateContactForm({
      isAuthenticated: false,
      form: { name: "Ana", instagram: "@ana" },
    });
    const payload = buildBookingContactPayload({
      form: { name: "Ana", instagram: "@ana" },
    });

    expect(validation.ok).toBe(true);
    expect(payload).toMatchObject({
      clientInstagram: "@ana",
      preferredContact: "instagram",
    });
  });
});

describe("Booking Conflict Recovery", () => {
  // Test 1
  it("isBookingConflict detects HTTP 409 as slot conflict regardless of error body", () => {
    expect(isBookingConflict(409)).toBe(true);
    expect(isBookingConflict(409, undefined)).toBe(true);
    expect(isBookingConflict(500)).toBe(false);
    expect(isBookingConflict(200)).toBe(false);
  });

  // Test 2
  it("SLOT_TAKEN error code and conflict phrases map to Serbian conflict message", () => {
    expect(mapBookingErrorMessage("SLOT_TAKEN")).toBe(BOOKING_CONFLICT_MESSAGE);
    expect(mapBookingErrorMessage("appointment conflict")).toBe(BOOKING_CONFLICT_MESSAGE);
    expect(mapBookingErrorMessage("termin je zauzet")).toBe(BOOKING_CONFLICT_MESSAGE);
    expect(isBookingConflict(200, "SLOT_TAKEN")).toBe(true);
    expect(isBookingConflict(200, "appointment conflict")).toBe(true);
  });

  // Test 3
  it("BookingModal opens AI drawer and invokes Claudia on booking conflict", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/landing/BookingModal.tsx"),
      "utf8",
    );

    expect(source).toContain("isBookingConflict(res.status");
    expect(source).toContain('action: "BOOKING_CONFLICT"');
    expect(source).toContain('source: "BookingModal"');
    expect(source).not.toContain("setDrawerOpen(true)");
  });

  // Test 4
  it("conflict payload forwards selectedSlot context to Claudia", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/landing/BookingModal.tsx"),
      "utf8",
    );

    expect(source).toContain("selectedSlot: slot");
    expect(source).toContain("salonId: slot?.salonId");
    expect(source).toContain("serviceName: slot?.serviceName");
    expect(source).toContain("startTime: bookingPayload?.startTime");
    expect(source).not.toContain("sendToOrchestrator(BOOKING_CONFLICT_MESSAGE");
  });

  // Test 5
  it("Claudia conflict fast-path searches for slots after the conflict hour", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/services/askAgent.ts"),
      "utf8",
    );

    expect(source).toContain('intent === "booking_conflict"');
    expect(source).toContain("conflictHour + 1");
    expect(source).toContain("timeWindowStart: conflictHour + 1");
  });

  // Test 6
  it("conflict alternatives prefer same salon before other salons in same city", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/services/askAgent.ts"),
      "utf8",
    );

    expect(source).toContain("sameSalonAfter");
    expect(source).toContain("otherSalonAfter");
    expect(source).toContain("...sameSalonAfter.slice(0, 2)");
    expect(source).toContain("s.salonId === originalSalonId");
    expect(source).toContain("s.salonId !== originalSalonId");
  });

  // Test 7
  it("falls back to other-salon and next-day alternatives when same salon unavailable", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/services/askAgent.ts"),
      "utf8",
    );

    expect(source).toContain("nextDaySameSalon");
    expect(source).toContain("needNextDay");
    expect(source).toContain("otherSalonAfter.slice");
    expect(source).toContain("Math.max(0, 3 - sameSalonSlots.length)");
  });

  // Test 8
  it("conflict payload preserves client contact context for booking modal pre-fill", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/landing/BookingModal.tsx"),
      "utf8",
    );

    expect(source).toContain("clientContext");
    expect(source).toContain("isAuthenticated: Boolean(user)");
    expect(source).toContain("phone: formPhone.trim() || undefined");
    expect(source).toContain("userName: user?.name");
  });

  it("useCancelAppointment invalidates appointment queries and emits cancellation event", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/hooks/useAppointmentActions.ts"),
      "utf8",
    );

    expect(source).toContain('queryKey: ["appointments"]');
    expect(source).toContain('queryKey: ["appointments-client"]');
    expect(source).toContain('type: "APPOINTMENT_CANCELLED"');
    expect(source).toContain("Termin je otkazan.");
  });

  it("appointment helper filters cancellable appointments and sorts latest first", () => {
    const appointments = [
      {
        _id: "old",
        status: "pending",
        cancellationStatus: "can_cancel",
        date: "2026-05-18",
        time: "09:00",
      },
      {
        _id: "late",
        status: "appointment_approved",
        cancellationStatus: "late_cancel",
        date: "2026-05-22",
        time: "15:00",
      },
      {
        _id: "cancelled",
        status: "appointment_cancelled",
        cancellationStatus: "can_cancel",
        date: "2026-05-23",
        time: "12:00",
      },
      {
        _id: "latest",
        status: "appointment_rescheduled",
        cancellationStatus: "can_cancel",
        date: "2026-05-24",
        time: "12:00",
      },
    ] as const;

    expect(isCancellableAppointment(appointments[1])).toBe(false);
    expect(filterAppointmentsByMode([...appointments], "can_cancel").map((item) => item._id)).toEqual([
      "latest",
      "old",
    ]);
    expect(sortAppointmentsByScheduledDesc([...appointments]).map((item) => item._id)[0]).toBe(
      "latest",
    );
  });

  it("expired cancel displays Serbian policy message", () => {
    expect(mapAppointmentActionError("late_cancel")).toBe(
      "Vreme za otkazivanje termina je isteklo.",
    );
  });

  it("Claudia intent schema supports appointment cancel and update intents", () => {
    expect(ClaudiaIntentSchema.safeParse("cancel_appointment").success).toBe(true);
    expect(ClaudiaIntentSchema.safeParse("confirm_cancel_appointment").success).toBe(true);
    expect(ClaudiaIntentSchema.safeParse("update_appointment").success).toBe(true);
    expect(ClaudiaIntentSchema.safeParse("confirm_update_appointment").success).toBe(true);
  });

  it("Claudia asks confirmation when one active appointment is provided", async () => {
    const stream = await askAgent(
      "Otkaži mi termin",
      true,
      [],
      "Milica",
      false,
      undefined,
      {
        intent: "cancel_appointment",
        appointments: [
          {
            _id: "app-1",
            status: "appointment_approved",
            cancellationStatus: "can_cancel",
            serviceName: "Šminkanje",
            date: "2026-05-20",
            time: "14:30",
          },
        ],
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.messages[0].content).toContain("Možete odmah da ga otkažete");
    expect(data.messages[0].attachToBlockType).toBe("AppointmentCancelConfirmBlock");
    expect(data.layout[0]).toMatchObject({
      type: "AppointmentCancelConfirmBlock",
      metadata: {
        appointmentId: "app-1",
        appointment: { _id: "app-1" },
      },
    });
    expect(data.intent).toMatchObject({
      type: "confirm_cancel_appointment",
      appointmentId: "app-1",
    });
  });

  it("Claudia shows appointment list when multiple appointments need a choice", async () => {
    const stream = await askAgent(
      "Otkaži mi termin",
      true,
      [],
      "Milica",
      false,
      undefined,
      {
        intent: "cancel_appointment",
        appointments: [
          {
            _id: "app-1",
            status: "pending",
            cancellationStatus: "can_cancel",
            serviceName: "Šminkanje",
          },
          {
            _id: "app-2",
            status: "appointment_approved",
            cancellationStatus: "can_cancel",
            serviceName: "Feniranje",
          },
        ],
      },
    );
    const data = JSON.parse(await readStream(stream));

    expect(data.layout[0]).toMatchObject({
      type: "CalendarBlock",
      metadata: {
        mode: "list",
        appointmentListMode: "can_cancel",
        intent: "cancel_appointment",
      },
    });
  });

  it("CalendarBlock passes appointmentListMode into client appointment list", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/blocks/CalendarBlockView.tsx"),
      "utf8",
    );

    expect(source).toContain("appointmentListMode={block.metadata?.appointmentListMode || \"all\"}");
  });

  it("calendar preview booking does not switch to appointments list or trigger salon recovery", () => {
    const calendarSource = readFileSync(
      path.join(process.cwd(), "src/components/blocks/CalendarBlockView.tsx"),
      "utf8",
    );
    const previewSource = readFileSync(
      path.join(process.cwd(), "src/components/blocks/CalendarBlockPreview.tsx"),
      "utf8",
    );

    expect(calendarSource).not.toContain('onBookingSuccess={() => setView("list")}');
    expect(previewSource).toContain("date: dateStr");
    expect(previewSource).toContain("timeLabel: time");
    expect(previewSource).not.toContain("onSlotClick(dateStr, time)");
  });

  it("booking confirmation toast uses the confirmed booking time", () => {
    const modalSource = readFileSync(
      path.join(process.cwd(), "src/components/landing/BookingModal.tsx"),
      "utf8",
    );
    const uiSource = readFileSync(
      path.join(process.cwd(), "src/context/landing/LandingUIContext.tsx"),
      "utf8",
    );
    const landingSource = readFileSync(
      path.join(process.cwd(), "src/components/landing/LandingPage.tsx"),
      "utf8",
    );

    expect(uiSource).toContain("confirmedTime");
    expect(modalSource).toContain("setConfirmedTime(bookingPayload?.time ?? \"\")");
    expect(landingSource).toContain("confirmedTime ||");
  });

  it("client appointments filter supports Mongo $oid ids and has no show-all fallback", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/blocks/ClientBlockAppointments.tsx"),
      "utf8",
    );

    expect(source).toContain("record.$oid");
    expect(source).toContain("clientEmail: user?.email ?? \"\"");
    expect(source).toContain("appointmentEmail === userEmail");
    expect(source).not.toContain("search: user?.email ?? \"\"");
    expect(source).not.toContain("clientId: currentUserId");
    expect(source).not.toContain("return user.isAdmin ? [] : all");
  });

  it("client appointments hook can query cross-tenant appointments by email", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/hooks/useAppointmentsWithToken.ts"),
      "utf8",
    );

    expect(source).toContain("clientEmail?: string");
    expect(source).toContain("search?: string");
    expect(source).toContain('params.append("clientEmail", clientEmail)');
    expect(source).toContain('params.append("search", search)');
  });

  it("Claudia appointment context fetch uses authenticated email", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/api/ai/conversation/route.ts"),
      "utf8",
    );

    expect(source).toContain("fetchClientAppointments(token: string | null, email?: string)");
    expect(source).toContain('params.set("clientEmail", email)');
    expect(source).not.toContain('params.set("search", email)');
    expect(source).toContain("requestUser?.email");
  });

  it("client appointment list can filter by salon", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/blocks/ClientBlockAppointments.tsx"),
      "utf8",
    );

    expect(source).toContain("Promeni salon");
    expect(source).toContain("setSelectedSalonId");
    expect(source).toContain("appointmentSalonId(appointment) === selectedSalonId");
  });

  it("appointment handoff refreshes auth and attaches appointment context", () => {
    const bridgeSource = readFileSync(
      path.join(process.cwd(), "src/components/chat-bus/AgentBridge.tsx"),
      "utf8",
    );
    const conversationSource = readFileSync(
      path.join(process.cwd(), "src/app/api/ai/conversation/route.ts"),
      "utf8",
    );

    expect(bridgeSource).toContain('handoffPayload?.intent === "cancel_appointment"');
    expect(bridgeSource).toContain('handoffPayload?.intent === "update_appointment"');
    expect(conversationSource).toContain("needsAppointmentContext");
    expect(conversationSource).toContain("fetchClientAppointments");
    expect(conversationSource).toContain("appointments: await fetchClientAppointments(");
    expect(conversationSource).toContain("requestUser?.email");
  });

  it("cancel confirmation block uses cancel appointment hook and CTA", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/blocks/AppointmentCancelConfirmBlockView.tsx"),
      "utf8",
    );

    expect(source).toContain("useCancelAppointment");
    expect(source).toContain("Otkaži termin");
    expect(source).toContain("aiAssisted: true");
  });

  it("successful cancel emits APPOINTMENT_CANCELLED action support", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/ai/events/chatEvents.ts"),
      "utf8",
    );

    expect(source).toContain('"APPOINTMENT_CANCELLED"');
    expect(source).toContain("isAppointmentActionEvent");
  });
});
