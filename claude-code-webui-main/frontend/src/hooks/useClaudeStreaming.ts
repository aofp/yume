// Simplified useClaudeStreaming hook that uses the new modular hooks
import { useStreamParser } from "./streaming/useStreamParser";

export function useClaudeStreaming() {
  const { processStreamLine } = useStreamParser();

  return {
    processStreamLine,
  };
}
