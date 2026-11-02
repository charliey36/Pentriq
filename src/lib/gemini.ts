/**
 * Gemini provider (Google Gen AI SDK).
 *
 * Thin wrapper around @google/genai, configured from GEMINI_API_KEY.
 * Kept separate from lib/ai.ts (the existing OpenAI/Anthropic-oriented
 * drafting hook) so that wiring Gemini in does not disturb the existing
 * template-fallback behavior there. Once this provider is proven out, it
 * can be plugged into draftMessageCopy in lib/ai.ts as another branch.
 *
 * Model selection note: gemini-2.5-flash / gemini-2.5-pro (originally
 * requested) both 404 as "no longer available to new users" for this API
 * key — confirmed via direct API calls on 2026-10-05. Google's own error
 * response for 2.5-flash explicitly directs callers to gemini-3.8-flash.
 * A gemini-3.*-pro fallback was tried and returns 429 RESOURCE_EXHAUSTED
 * with a hard 0 free-tier quota (not a transient overload) — so the
 * fallback below targets gemini-3.7-flash, a second flash-tier model
 * verified working with this key, instead of a pro model that would
 * guarantee-fail. Revert to the 2.5 models if the key/project is later
 * granted access to them.
 */
import { GoogleGenAI } from '@google/genai';

export const PRIMARY_MODEL = 'gemini-3.8-flash';
export const FALLBACK_MODEL = 'gemini-3.7-flash';

const RETRY_DELAYS_MS = [2000, 5000, 10000];

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in the environment.');
  }
  return apiKey;
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: getApiKey() });
  }
  return client;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True for errors worth retrying/falling back on (overload/transient), false for e.g. bad input. */
function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('503') ||
    message.includes('UNAVAILABLE') ||
    message.includes('429') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('500') ||
    message.includes('INTERNAL')
  );
}

/** Maps internal/SDK errors to a short, user-safe message — never leaks raw provider payloads. */
function toUserFriendlyMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('503') || message.includes('UNAVAILABLE')) {
    return 'Gemini is currently overloaded. Please try again in a moment.';
  }
  if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
    return 'Gemini usage limit reached. Please try again later.';
  }
  if (message.includes('GEMINI_API_KEY')) {
    return 'AI service is not configured correctly. Please contact support.';
  }
  if (message.includes('empty response')) {
    return 'Gemini did not return a response. Please try rephrasing your prompt.';
  }
  return 'Something went wrong talking to the AI service. Please try again.';
}

async function callModel(model: string, prompt: string): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }
  return text;
}

/**
 * Calls `model` with up to 3 retries on transient errors, using exponential
 * backoff of 2s / 5s / 10s between attempts. Logs each attempt (model,
 * attempt number, outcome, elapsed time). Rethrows the last error if all
 * attempts fail, or immediately rethrows non-retryable errors.
 */
async function callModelWithRetries(model: string, prompt: string, retryDelays: number[] = RETRY_DELAYS_MS): Promise<string> {
  const maxAttempts = retryDelays.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();
    try {
      const text = await callModel(model, prompt);
      const elapsedMs = Date.now() - attemptStart;
      console.log(
        `[gemini] model=${model} attempt=${attempt}/${maxAttempts} status=success responseTimeMs=${elapsedMs}`
      );
      return text;
    } catch (error) {
      const elapsedMs = Date.now() - attemptStart;
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[gemini] model=${model} attempt=${attempt}/${maxAttempts} status=error responseTimeMs=${elapsedMs} error=${message}`
      );

      const isLastAttempt = attempt === maxAttempts;
      if (!isRetryableError(error) || isLastAttempt) {
        throw error;
      }

      const delayMs = retryDelays[attempt - 1];
      console.log(`[gemini] model=${model} retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxAttempts})`);
      await sleep(delayMs);
    }
  }

  // Unreachable, but keeps TypeScript satisfied.
  throw new Error('Gemini request failed after all retry attempts.');
}

/**
 * Sends a single text prompt to Gemini and returns the plain-text response.
 *
 * Flow: tries PRIMARY_MODEL with up to 3 retries (2s/5s/10s backoff) on
 * transient errors (503 overload, 429 quota, 5xx). If all primary attempts
 * fail with a retryable error, automatically falls back to FALLBACK_MODEL
 * with its own retry sequence. Non-retryable errors (bad input, missing
 * API key) fail immediately without retrying.
 *
 * Throws an Error with a short, user-friendly message — callers can show
 * `error.message` directly in the UI.
 */
export async function generateGeminiText(prompt: string, options: { quick?: boolean } = {}): Promise<string> {
  // Interactive callers (a user waiting on a button) use one short retry per model instead of ~17s of backoff.
  const delays = options.quick ? [1000] : RETRY_DELAYS_MS;
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error('Prompt must not be empty.');
  }

  const overallStart = Date.now();
  console.log(`[gemini] request started selectedModel=${PRIMARY_MODEL}`);

  try {
    const text = await callModelWithRetries(PRIMARY_MODEL, trimmed, delays);
    console.log(`[gemini] request completed model=${PRIMARY_MODEL} totalTimeMs=${Date.now() - overallStart}`);
    return text;
  } catch (primaryError) {
    if (!isRetryableError(primaryError)) {
      throw new Error(toUserFriendlyMessage(primaryError));
    }

    console.log(`[gemini] primary model ${PRIMARY_MODEL} exhausted retries, falling back to ${FALLBACK_MODEL}`);

    try {
      const text = await callModelWithRetries(FALLBACK_MODEL, trimmed, delays);
      console.log(`[gemini] request completed model=${FALLBACK_MODEL} totalTimeMs=${Date.now() - overallStart}`);
      return text;
    } catch (fallbackError) {
      console.error(
        `[gemini] request failed after exhausting both models totalTimeMs=${Date.now() - overallStart}`
      );
      throw new Error(toUserFriendlyMessage(fallbackError));
    }
  }
}
