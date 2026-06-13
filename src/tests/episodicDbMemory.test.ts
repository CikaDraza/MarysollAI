// src/tests/episodicDbMemory.test.ts
//
// Faza 6 — strukturisane DB epizode. Pokriva: mapiranje epizoda → EpisodicMemory
// (osnova za "prošli put ste tražili..."), PII-bezbednost modela/writera, i
// dedup/guard logiku store-a (sa mockovanim Mongo modelom).

jest.mock("@/lib/db/mongodb", () => ({
  connectToDB: jest.fn().mockResolvedValue(undefined),
}));

const findOneLean = jest.fn();
const create = jest.fn();
const findChain = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn(),
};

jest.mock("@/lib/models/AgentEpisode", () => ({
  AgentEpisode: {
    findOne: jest.fn(() => ({ select: () => ({ lean: findOneLean }) })),
    create: (...args: unknown[]) => create(...args),
    find: jest.fn(() => findChain),
  },
}));

import {
  episodesToEpisodicMemory,
  recordAgentEpisode,
  fetchRecentEpisodes,
} from "@/lib/ai/memory/agentEpisodeStore";
import type { IAgentEpisode } from "@/lib/models/AgentEpisode";

beforeEach(() => {
  jest.clearAllMocks();
  findOneLean.mockResolvedValue(null);
  create.mockResolvedValue({});
  findChain.lean.mockResolvedValue([]);
});

describe("episodesToEpisodicMemory", () => {
  it("izvlači poslednju uspešnu rezervaciju za 'prošli put' hook", () => {
    const episodes: IAgentEpisode[] = [
      // newest-first (kako vraća fetchRecentEpisodes)
      {
        conversationId: "c1",
        type: "booking",
        outcome: "success",
        city: "Bor",
        service: "Maderoterapija",
        salonName: "Beauty M Glow",
        createdAt: new Date("2026-06-10T10:00:00Z"),
      },
      {
        conversationId: "c1",
        type: "price",
        outcome: "viewed",
        city: "Bor",
        service: "Maderoterapija",
        createdAt: new Date("2026-06-09T10:00:00Z"),
      },
    ];
    const memory = episodesToEpisodicMemory(episodes);
    expect(memory.lastSuccessfulBooking?.service).toBe("Maderoterapija");
    expect(memory.lastSuccessfulBooking?.city).toBe("Bor");
    expect(memory.lastSuccessfulBooking?.salonName).toBe("Beauty M Glow");
    expect(memory.preferredCities[0]).toBe("Bor");
    expect(memory.preferredServices[0]).toBe("Maderoterapija");
  });

  it("slot_taken epizoda postaje lastFailedBooking", () => {
    const memory = episodesToEpisodicMemory([
      {
        conversationId: "c1",
        type: "booking",
        outcome: "slot_taken",
        city: "Novi Sad",
        service: "feniranje",
        recoveryUsed: true,
        createdAt: new Date(),
      },
    ]);
    expect(memory.lastFailedBooking?.reason).toBe("slot_taken");
    expect(memory.lastFailedBooking?.recoveryUsed).toBe(true);
  });
});

describe("recordAgentEpisode — guard i dedup", () => {
  it("preskače upis bez recall ključa (ni userId ni guestSessionId)", async () => {
    await recordAgentEpisode({
      conversationId: "c1",
      type: "booking",
      outcome: "success",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("upisuje epizodu kada postoji guestSessionId", async () => {
    await recordAgentEpisode({
      conversationId: "c1",
      guestSessionId: "guest_1",
      type: "booking",
      outcome: "success",
      city: "Bor",
      service: "Maderoterapija",
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("dedup: ne upisuje istu epizodu dva puta u kratkom roku", async () => {
    findOneLean.mockResolvedValueOnce({ _id: "existing" });
    await recordAgentEpisode({
      conversationId: "c1",
      userId: "u1",
      type: "booking",
      outcome: "success",
      city: "Bor",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("NE čuva PII — clean uklanja prazna polja, model nema PII kolone", async () => {
    await recordAgentEpisode({
      conversationId: "c1",
      userId: "u1",
      type: "booking",
      outcome: "success",
      city: "Bor",
      service: "",
    });
    const created = create.mock.calls[0][0] as Record<string, unknown>;
    // Strukturisana polja da; nikakvih kontakt/PII polja.
    expect(created).toHaveProperty("city", "Bor");
    expect(created).not.toHaveProperty("service"); // prazan string očišćen
    expect(created).not.toHaveProperty("email");
    expect(created).not.toHaveProperty("phone");
    expect(created).not.toHaveProperty("name");
    expect(created).not.toHaveProperty("instagram");
  });
});

describe("fetchRecentEpisodes — recall ključ", () => {
  it("preferira userId nad guestSessionId", async () => {
    const { AgentEpisode } = jest.requireMock("@/lib/models/AgentEpisode");
    await fetchRecentEpisodes({ userId: "u1", guestSessionId: "g1" });
    expect(AgentEpisode.find).toHaveBeenCalledWith({ userId: "u1" });
  });

  it("prazan ključ ne udara bazu", async () => {
    const { AgentEpisode } = jest.requireMock("@/lib/models/AgentEpisode");
    const rows = await fetchRecentEpisodes({});
    expect(rows).toEqual([]);
    expect(AgentEpisode.find).not.toHaveBeenCalled();
  });
});
