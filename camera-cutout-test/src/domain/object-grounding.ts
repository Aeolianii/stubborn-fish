export const OBJECT_SUBJECT_TYPES = [
  "person",
  "animal",
  "plant",
  "other"
] as const;

export type ObjectSubjectType = (typeof OBJECT_SUBJECT_TYPES)[number];

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface NormalizedBoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface ObjectGrounding {
  targetLabel: string;
  bbox: NormalizedBoundingBox;
  center: NormalizedPoint;
  polygon: NormalizedPoint[];
  confidence: number;
}
