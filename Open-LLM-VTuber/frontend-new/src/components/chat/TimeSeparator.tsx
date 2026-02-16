import { memo } from "react";

function formatSeparatorTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDay.getTime() === today.getTime()) {
    // 今天：上午/下午 HH:MM
    const hour = d.getHours();
    const period = hour < 12 ? "上午" : "下午";
    return `${period} ${time}`;
  }
  if (msgDay.getTime() === yesterday.getTime()) {
    return `昨天 ${time}`;
  }
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}/${day} ${time}`;
}

/** Returns true if the gap between two ISO timestamps exceeds 5 minutes. */
export function shouldShowSeparator(
  prevTimestamp: string,
  currTimestamp: string
): boolean {
  const diff = new Date(currTimestamp).getTime() - new Date(prevTimestamp).getTime();
  return Math.abs(diff) > 5 * 60 * 1000;
}

export const TimeSeparator = memo(({ timestamp }: { timestamp: string }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "8px 24px",
      margin: "4px 0",
    }}
  >
    <div
      style={{
        flex: 1,
        height: "1px",
        background: "linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)",
      }}
    />
    <span
      style={{
        fontSize: "11px",
        color: "rgba(255, 255, 255, 0.3)",
        whiteSpace: "nowrap",
        letterSpacing: "0.5px",
        userSelect: "none",
      }}
    >
      {formatSeparatorTime(timestamp)}
    </span>
    <div
      style={{
        flex: 1,
        height: "1px",
        background: "linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)",
      }}
    />
  </div>
));

TimeSeparator.displayName = "TimeSeparator";
