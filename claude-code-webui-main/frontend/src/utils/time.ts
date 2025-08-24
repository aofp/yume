import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

// Initialize the relative time plugin
dayjs.extend(relativeTime);

/**
 * Format a timestamp as an absolute time string
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted absolute time string (e.g., "14:30", "Dec 15, 14:30")
 */
export function formatAbsoluteTime(timestamp: number): string {
  const messageTime = dayjs(timestamp);
  const now = dayjs();

  // If it's today, show only time (HH:mm)
  if (messageTime.isSame(now, "day")) {
    return messageTime.format("HH:mm");
  }

  // If it's this year, show date and time without year
  if (messageTime.isSame(now, "year")) {
    return messageTime.format("MMM D, HH:mm");
  }

  // If it's from a different year, show full date and time
  return messageTime.format("MMM D, YYYY HH:mm");
}

/**
 * Format a timestamp as a relative time string
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted relative time string (e.g., "2 minutes ago", "just now")
 */
export function formatRelativeTime(timestamp: number): string {
  const messageTime = dayjs(timestamp);
  const now = dayjs();

  // If the timestamp is in the future, clamp to "just now"
  if (messageTime.isAfter(now)) {
    return "just now";
  }

  const diffInMinutes = now.diff(messageTime, "minute");

  // Show "just now" for very recent messages (< 1 minute)
  if (diffInMinutes < 1) {
    return "just now";
  }

  return messageTime.fromNow();
}
