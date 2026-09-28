export const VILLAGES = [
  "Tiburon",
  "Mill Valley",
  "Novato",
  "San Rafael",
  "Twin Cities",
  "Ross Valley",
] as const;

export type Village = (typeof VILLAGES)[number];

/** Existing SpokeRSVP events and hosts belong to Mill Valley. */
export const DEFAULT_VILLAGE: Village = "Mill Valley";

export function isVillage(value: string | null | undefined): value is Village {
  return VILLAGES.includes(value as Village);
}

/** Header and page title, e.g. "Mill Valley Village". */
export function villageTitle(village: string): string {
  return `${village} Village`;
}
