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

export function isRegistrationClosed(registrationDeadline) {
  if (!registrationDeadline) return false;
  return registrationDeadline.slice(0, 10) < getTokyoDateString();
}

export function formatDeadlineDate(lang, registrationDeadline) {
  if (!registrationDeadline) return "";

  const [year, month, day] = registrationDeadline.slice(0, 10).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}
