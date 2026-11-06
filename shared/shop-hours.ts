/** The connected pilot uses India time. Overnight windows extend into the next morning. */
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function validShopHours(
  settings: Record<string, unknown> | null | undefined
) {
  const a = settings?.openingTime,
    b = settings?.closingTime;
  return (
    (a == null && b == null) ||
    (typeof a === "string" &&
      typeof b === "string" &&
      timePattern.test(a) &&
      timePattern.test(b) &&
      a !== b)
  );
}
export function withinShopHours(
  settings: Record<string, unknown> | null | undefined,
  now = new Date()
) {
  if (!validShopHours(settings)) return false;
  const a = settings?.openingTime as string | undefined,
    b = settings?.closingTime as string | undefined;
  if (!a && !b) return true;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const minute =
      Number(parts.find(p => p.type === "hour")!.value) * 60 +
      Number(parts.find(p => p.type === "minute")!.value),
    asMinutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const start = asMinutes(a!),
    end = asMinutes(b!);
  return start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end;
}
