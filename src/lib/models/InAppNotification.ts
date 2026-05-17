import mongoose, { Schema, Document, Model } from "mongoose";

export interface IInAppNotification {
  clientId: string;
  type: "availability_watch_matched";
  title: string;
  message: string;
  href?: string;
  readAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface IInAppNotificationDoc extends IInAppNotification, Document {}

const InAppNotificationSchema = new Schema<IInAppNotificationDoc>(
  {
    clientId: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    href: { type: String },
    readAt: { type: Date },
  },
  { timestamps: true },
);

export const InAppNotification: Model<IInAppNotificationDoc> =
  mongoose.models.InAppNotification ||
  mongoose.model<IInAppNotificationDoc>(
    "InAppNotification",
    InAppNotificationSchema,
    "in_app_notifications",
  );
