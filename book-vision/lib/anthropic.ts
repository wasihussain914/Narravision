import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/**
 * Returns the shared Anthropic SDK client, creating it on first call.
 *
 * Uses a module-level singleton so the client is initialised once per process
 * and reused across all callers — avoids redundant API key lookups and keeps
 * connection state (HTTP keep-alive) pooled.
 *
 * @throws {Error} if `ANTHROPIC_API_KEY` is not set in the environment.
 * @returns The singleton {@link Anthropic} client instance.
 *
 * @example
 * const anthropic = getAnthropic();
 * const response = await anthropic.messages.create({ model: CLAUDE_MODEL, ... });
 */
export function getAnthropic(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * The Claude model used for all Narravision inference calls (story-bible
 * extraction, Q&A, narration prompts, and image-prompt generation).
 *
 * Centralised here so every lib module imports the same constant rather than
 * hardcoding a model string — a single edit upgrades the whole pipeline.
 */
export const CLAUDE_MODEL = "claude-sonnet-4-6";
