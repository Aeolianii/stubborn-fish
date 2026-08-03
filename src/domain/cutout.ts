export const CUTOUT_CATEGORIES = [
  "animal",
  "plant",
  "natural_landscape",
  "other"
] as const;

export type CutoutCategory = (typeof CUTOUT_CATEGORIES)[number];
export type CutoutSource = "camera" | "album";
export type ImportedSubjectType =
  | "person"
  | "aquatic_animal"
  | "land_animal"
  | "plant"
  | "other";

export interface CutoutRecord {
  id: string;
  status: "ready";
  description: string;
  source: CutoutSource;
  name: string | null;
  category: CutoutCategory | null;
  attributes: null;
  mimeType: "image/png";
  usedFallback: boolean;
  transparencyRatio: number;
  createdAt: string;
  expiresAt: string;
}
