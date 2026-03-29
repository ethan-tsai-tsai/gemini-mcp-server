/**
 * Configuration loader — reads from environment variables.
 */

export function getConfig() {
  return {
    geminiCliPath: process.env.GEMINI_CLI_PATH || 'gemini',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS, 10) || 120_000,
  };
}
