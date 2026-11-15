const sorted = (names: string[]): string[] => names.map((name) => name.trim()).filter((name) => name.length > 0);

export function listNames(names: string[]): string {
  const clean = sorted(names);
  if (clean.length <= 1) return clean[0] ?? "";
  return clean.slice(0, -1).join(", ") + " and " + clean[clean.length - 1];
}

export function comePhrase(names: string[]): string {
  const clean = sorted(names);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0] + " comes";
  if (clean.length === 2) return clean[0] + " and " + clean[1] + " come";
  return "all " + clean.length + " come";
}

export function midSentence(text: string): string {
  const flat = text.trim();
  return flat.length === 0 ? flat : flat.charAt(0).toLowerCase() + flat.slice(1);
}

const GENERIC_PLACE_WORDS = new Set([
  "the",
  "and",
  "of",
  "park",
  "trail",
  "path",
  "road",
  "farm",
  "garden",
  "lane",
  "street",
  "avenue",
  "blvd",
]);

function stems(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

export function titleNamesPlace(title: string, place: string | null): boolean {
  if (!place) return false;
  const key = stems(place).filter((word) => !GENERIC_PLACE_WORDS.has(word));
  const inTitle = new Set(stems(title));
  if (key.length === 0) return stems(title).join(" ") === stems(place).join(" ");
  const found = key.filter((word) => inTitle.has(word)).length;
  return found >= Math.max(1, Math.ceil(key.length / 2));
}
