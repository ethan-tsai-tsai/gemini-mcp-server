/**
 * Configuration loader — reads from environment variables.
 */

export function getConfig() {
  const parsedTimeout = parseInt(process.env.GEMINI_TIMEOUT_MS, 10);
  if (process.env.GEMINI_TIMEOUT_MS && (Number.isNaN(parsedTimeout) || parsedTimeout <= 0)) {
    console.error(`[config] Invalid GEMINI_TIMEOUT_MS: "${process.env.GEMINI_TIMEOUT_MS}", using default 120000`);
  }

  return {
    geminiCliPath: process.env.GEMINI_CLI_PATH || 'gemini',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    timeoutMs: (parsedTimeout > 0 ? parsedTimeout : null) || 120_000,
  };
}
