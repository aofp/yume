import { useState, useEffect } from "react";
import { formatAbsoluteTime, formatRelativeTime } from "../utils/time";

interface TimestampProps {
  timestamp: number;
  className?: string;
  mode?: "absolute" | "relative";
}

export function TimestampComponent({
  timestamp,
  className = "",
  mode = "absolute",
}: TimestampProps) {
  const [displayTime, setDisplayTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      setDisplayTime(
        mode === "absolute"
          ? formatAbsoluteTime(timestamp)
          : formatRelativeTime(timestamp),
      );
    };

    // Initial update
    updateTime();

    // For relative time, update every minute
    // TODO: Consider using a shared timer/context for batch updates when many messages use relative mode
    if (mode === "relative") {
      const interval = setInterval(updateTime, 60000);
      return () => clearInterval(interval);
    }
  }, [timestamp, mode]);

  return (
    <span className={className} aria-label={`Sent at ${displayTime}`}>
      {displayTime}
    </span>
  );
}
