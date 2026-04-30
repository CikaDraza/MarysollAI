export interface PlatformCategory {
  key: string;
  label: string;
  synonyms: string[];
  subcategories: Array<{
    key: string;
    label: string;
    synonyms: string[];
  }>;
  popularityScore?: number;
}
