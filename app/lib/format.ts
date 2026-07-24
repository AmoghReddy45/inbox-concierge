/** Row meta, Superhuman-cased: same-day → "9:42 AM", this year → "Jul 18", else "Jul 18, 2025". */
export function formatRowTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date
      .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      .replace(/\s/g, " ");
  }
  const monthDay = date.toLocaleDateString([], { month: "short", day: "numeric" });
  if (date.getFullYear() === now.getFullYear()) return monthDay;
  return `${monthDay}, ${date.getFullYear()}`;
}

export type DateGroup = "Today" | "Yesterday" | "Last 7 days" | "Earlier";

export function dateGroupOf(iso: string, now = new Date()): DateGroup {
  const date = new Date(iso);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (time >= startOfDay) return "Today";
  if (time >= startOfDay - 86_400_000) return "Yesterday";
  if (time >= startOfDay - 6 * 86_400_000) return "Last 7 days";
  return "Earlier";
}

export const DATE_GROUP_ORDER: DateGroup[] = ["Today", "Yesterday", "Last 7 days", "Earlier"];

export function formatCost(costMicros: number | null): string {
  if (costMicros === null) return "n/a";
  return `$${(costMicros / 1_000_000).toFixed(4)}`;
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}
