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

/** Empty means every village. Unknown names are ignored. Order follows VILLAGES. */
export function parseVillageFilter(raw: string | string[] | undefined): Village[] {
  const text = Array.isArray(raw) ? raw.join(",") : raw || "";
  const picked = new Set(
    text
      .split(",")
      .map((part) => part.trim())
      .filter(isVillage),
  );
  const selected = VILLAGES.filter((village) => picked.has(village));
  return selected.length === VILLAGES.length ? [] : selected;
}

export function villageFilterHref(selected: readonly Village[]): string {
  if (selected.length === 0) return "/";
  return `/?villages=${encodeURIComponent(selected.join(","))}`;
}

/** Toggle one village. Starting from “all”, the first click narrows to that village. */
export function toggleVillageHref(selected: readonly Village[], village: Village): string {
  if (selected.length === 0) return villageFilterHref([village]);
  const next = selected.includes(village)
    ? selected.filter((item) => item !== village)
    : [...selected, village];
  return villageFilterHref(VILLAGES.filter((item) => next.includes(item)));
}
