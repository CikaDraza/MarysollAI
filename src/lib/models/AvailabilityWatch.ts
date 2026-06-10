import mongoose, { Schema, Document, Model } from "mongoose";
import type { SearchResult } from "@/types/slots";

export type AvailabilityWatchStatus =
  | "active"
  | "matched"
  | "notified"
  | "booked"
  | "expired"
  | "cancelled";

export type NotificationChannel = "email" | "push" | "in_app";

export interface IAvailabilityWatch {
  tenantId?: string;
  salonId?: string;
  salonName?: string;
  city: string;
  serviceId?: string;
  serviceName: string;
  category?: string;
  preferredDate?: string;
  timeWindowStart?: number;
  timeWindowEnd?: number;
  clientId?: string;
  name?: string;
  email?: string;
  phone?: string;
  instagram?: string;
  tiktok?: string;
  status: AvailabilityWatchStatus;
  matchedSlot?: Partial<SearchResult>;
  notificationChannels: NotificationChannel[];
  pushSubscription?: {
    endpoint: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
  /** SHA-256 key used for deduplication on POST. */
  dedupeKey?: string;
  /** Per-cron-run advisory lock to prevent concurrent processing. */
  notificationLock?: {
    lockedAt: Date;
    lockId: string;
  };
  /** How many notification delivery attempts have been made. */
  notificationAttempts?: number;
  /** Last notification error message for observability. */
  lastNotificationError?: string;
  /** When this watch was successfully matched to a slot. */
  matchedAt?: Date;
  /** When this watch was cancelled by the user. */
  cancelledAt?: Date;
  expiresAt: Date;
  lastCheckedAt?: Date;
  /** Earliest time this watch should be re-checked by the cron. Used to space
   * out polling based on how far the preferredDate is. */
  nextCheckAt?: Date;
  notifiedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAvailabilityWatchDoc extends IAvailabilityWatch, Document {}

const AvailabilityWatchSchema = new Schema<IAvailabilityWatchDoc>(
  {
    tenantId: { type: String, index: true },
    salonId: { type: String, index: true },
    salonName: { type: String },
    city: { type: String, required: true, index: true },
    serviceId: { type: String },
    serviceName: { type: String, required: true, index: true },
    category: { type: String, index: true },
    preferredDate: { type: String },
    timeWindowStart: { type: Number },
    timeWindowEnd: { type: Number },
    clientId: { type: String, index: true },
    name: { type: String },
    email: { type: String, index: true },
    phone: { type: String },
    instagram: { type: String },
    tiktok: { type: String },
    status: {
      type: String,
      enum: ["active", "matched", "notified", "booked", "expired", "cancelled"],
      default: "active",
      index: true,
    },
    matchedSlot: { type: Schema.Types.Mixed },
    notificationChannels: {
      type: [String],
      enum: ["email", "push", "in_app"],
      default: ["email"],
    },
    pushSubscription: { type: Schema.Types.Mixed },
    dedupeKey: { type: String, index: true },
    notificationLock: {
      type: new Schema({
        lockedAt: { type: Date, required: true },
        lockId: { type: String, required: true },
      }),
      default: undefined,
    },
    notificationAttempts: { type: Number, default: 0 },
    lastNotificationError: { type: String },
    matchedAt: { type: Date },
    cancelledAt: { type: Date },
    expiresAt: { type: Date, required: true, index: true },
    lastCheckedAt: { type: Date },
    nextCheckAt: { type: Date },
    notifiedAt: { type: Date },
  },
  { timestamps: true },
);

// Compound index supporting the availability-watch cron candidate query:
// active + not expired + due (nextCheckAt) + claimable (lock) + ordered.
AvailabilityWatchSchema.index({
  status: 1,
  expiresAt: 1,
  nextCheckAt: 1,
  "notificationLock.lockedAt": 1,
  lastCheckedAt: 1,
  createdAt: 1,
});

export const AvailabilityWatch: Model<IAvailabilityWatchDoc> =
  mongoose.models.AvailabilityWatch ||
  mongoose.model<IAvailabilityWatchDoc>(
    "AvailabilityWatch",
    AvailabilityWatchSchema,
    "availability_watches",
  );
