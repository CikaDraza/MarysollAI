import { model, Schema, Document, models } from "mongoose";

export interface ISubcategory {
  key: string;
  label: string;
  synonyms: string[];
}

export interface ICategoryDoc extends Document {
  key: string;
  label: string;
  synonyms: string[];
  subcategories: ISubcategory[];
  isActive: boolean;
  popularityScore: number;
  createdAt: Date;
  updatedAt: Date;
}

const SubcategorySchema = new Schema<ISubcategory>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    synonyms: [{ type: String }],
  },
  { _id: false },
);

const CategorySchema = new Schema<ICategoryDoc>(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    synonyms: [{ type: String }],
    subcategories: [SubcategorySchema],
    isActive: { type: Boolean, default: true },
    popularityScore: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Category =
  models.Category || model<ICategoryDoc>("Category", CategorySchema);
