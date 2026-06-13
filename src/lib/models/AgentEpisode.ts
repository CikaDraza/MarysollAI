import mongoose, { Schema, Document, Model } from "mongoose";

// Faza 6 — strukturisane booking/user epizode (NE raw chat memorija).
//
// Čuvamo SAMO strukturisani ishod važnog događaja da bi Claudia mogla da kaže
// "Prošli put ste tražili maderoterapiju u Boru — da proverim Beauty M Glow
// ponovo?". NIKADA ne čuvamo: poruke razgovora, telefon, email, Instagram,
// imena, niti bilo koji privatni sadržaj. Kolekcija je lokalna (kao
// AvailabilityWatch), nije platform podatak.

export type AgentEpisodeType =
  | "booking"
  | "price"
  | "search"
  | "notify"
  | "appointment_update"
  | "appointment_cancel";

export type AgentEpisodeOutcome =
  | "success"
  | "failed"
  | "slot_taken"
  | "no_slots"
  | "notify_created"
  | "cancelled"
  | "updated"
  | "viewed";

export interface IAgentEpisode {
  conversationId: string;
  /** Logged-in user id (from token). Absent for guests. */
  userId?: string;
  /** Stable guest identity (browser localStorage). Absent for logged-in. */
  guestSessionId?: string;
  type: AgentEpisodeType;
  outcome: AgentEpisodeOutcome;
  city?: string;
  service?: string;
  category?: string;
  salonId?: string;
  salonName?: string;
  date?: string;
  time?: string;
  recoveryUsed?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAgentEpisodeDoc extends IAgentEpisode, Document {}

const AgentEpisodeSchema = new Schema<IAgentEpisodeDoc>(
  {
    conversationId: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    guestSessionId: { type: String, index: true },
    type: {
      type: String,
      enum: [
        "booking",
        "price",
        "search",
        "notify",
        "appointment_update",
        "appointment_cancel",
      ],
      required: true,
    },
    outcome: {
      type: String,
      enum: [
        "success",
        "failed",
        "slot_taken",
        "no_slots",
        "notify_created",
        "cancelled",
        "updated",
        "viewed",
      ],
      required: true,
    },
    city: { type: String },
    service: { type: String },
    category: { type: String },
    salonId: { type: String },
    salonName: { type: String },
    date: { type: String },
    time: { type: String },
    recoveryUsed: { type: Boolean },
  },
  { timestamps: true },
);

// Recall query: most recent episodes for a user OR guest, newest first.
AgentEpisodeSchema.index({ userId: 1, createdAt: -1 });
AgentEpisodeSchema.index({ guestSessionId: 1, createdAt: -1 });

// These are short-lived structured episodes, not permanent history — expire
// after 90 days so the collection stays a rolling recent-activity window.
AgentEpisodeSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);

export const AgentEpisode: Model<IAgentEpisodeDoc> =
  mongoose.models.AgentEpisode ||
  mongoose.model<IAgentEpisodeDoc>(
    "AgentEpisode",
    AgentEpisodeSchema,
    "agent_episodes",
  );
