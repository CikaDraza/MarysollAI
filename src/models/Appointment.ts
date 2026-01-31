import { Schema, model, models, Types } from "mongoose";

const servicesSchema = new Schema(
  {
    serviceId: {
      type: Types.ObjectId,
      ref: "Service",
      required: true,
    },
    quantity: { type: Number, default: 1 },
    serviceName: { type: String, required: true },
    price: Number,
    duration: { type: Number, required: true },
  },
  { _id: false },
);

const messageSchema = new Schema(
  {
    sender: {
      type: String,
      enum: ["client", "admin"],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const appointmentSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    clientName: { type: String, required: true },
    clientEmail: { type: String, required: true },
    serviceName: { type: String, required: true },
    services: [servicesSchema],
    date: { type: String, required: true },
    time: { type: String, required: true },
    duration: { type: Number, required: true },
    note: String,
    status: {
      type: String,
      enum: [
        "pending",
        "appointment_approved", // ✅
        "appointment_rejected", // ✅
        "appointment_rescheduled", // ✅
        "appointment_cancelled", // ✅
        "completed",
        "no_show",
      ],
      default: "pending",
    },
    messages: [messageSchema],
    lastSeen: {
      client: Date,
      admin: Date,
    },
    unreadCount: {
      client: { type: Number, default: 0 },
      admin: { type: Number, default: 0 },
    },
    adminNotified: { type: Boolean, default: false },
    clientNotified: { type: Boolean, default: false },
    proposedDate: String,
    proposedTime: String,
    lastUpdatedBy: {
      type: String,
      enum: ["client", "admin"],
    },
  },
  { timestamps: true },
);

export const Appointment =
  models.Appointment || model("Appointment", appointmentSchema);
