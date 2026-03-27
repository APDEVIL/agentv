/**
 * Estimates token count for a string.
 * Rule of thumb: ~4 characters per token for English text.
 * For production, swap this with the `tiktoken` package for exact counts.
 *
 * Install exact counter: bun add tiktoken
 */

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(
  messages: { role: string; content: string }[]
): number {
  return messages.reduce((total, msg) => {
    // +4 per message for role/formatting overhead
    return total + estimateTokens(msg.content) + 4;
  }, 0);
}

/** Returns true if the messages would exceed the given token limit */
export function isOverLimit(
  messages: { role: string; content: string }[],
  limit: number
): boolean {
  return estimateMessagesTokens(messages) > limit;
}

/** Trims messages from the front (oldest first) until under the token limit */
export function trimToLimit(
  messages: { role: string; content: string }[],
  limit: number
): { role: string; content: string }[] {
  let trimmed = [...messages];
  while (trimmed.length > 1 && isOverLimit(trimmed, limit)) {
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}