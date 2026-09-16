export function getTokyoDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getDateOnlyKey(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function parseDateOnly(value) {
  const key = getDateOnlyKey(value);
  if (!key) return null;

  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatEventDate(lang, value, options = {}) {
  const date = parseDateOnly(value);
  if (!date) return "";

  const locale = lang === "ja" ? "ja-JP" : "en-US";
  const formatOptions = options.full
    ? { weekday: "long", year: "numeric", month: "long", day: "numeric" }
    : { year: "numeric", month: "numeric", day: "numeric" };

  return date.toLocaleDateString(locale, formatOptions);
}

export function isPastEventDate(value) {
  const key = getDateOnlyKey(value);
  if (!key) return false;
  return key < getTokyoDateString();
}

export function compareEventDates(a, b) {
  const keyA = getDateOnlyKey(a);
  const keyB = getDateOnlyKey(b);
  return keyA.localeCompare(keyB);
}
