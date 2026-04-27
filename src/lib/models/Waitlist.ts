import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWaitlist {
  name?: string;
  phone: string;
  email?: string;
  service: string;
  city?: string;
  preferredTime?: string;
  instagram?: string;
  tiktok?: string;
}

interface IWaitlistDoc extends IWaitlist, Document {}

const WaitlistSchema = new Schema<IWaitlistDoc>(
  {
    name: { type: String },
    phone: { type: String, required: true },
    email: { type: String },
    service: { type: String, required: true },
    city: { type: String, default: "" },
    preferredTime: { type: String },
    instagram: { type: String },
    tiktok: { type: String },
  },
  { timestamps: true },
);

export const Waitlist: Model<IWaitlistDoc> =
  mongoose.models.Waitlist ||
  mongoose.model<IWaitlistDoc>("Waitlist", WaitlistSchema);
