import { spawn } from 'node:child_process';
import { getConfig } from './config.js';

/**
 * Run gemini CLI with a prompt and optional stdin content.
 *
 * Design decisions:
 * - Uses spawn (not exec) to avoid shell injection.
 * - Prompt is passed via -p flag; large context is piped through stdin.
 * - Output is collected from stdout; stderr is logged for debugging.
 * - Timeout uses AbortController signal.
 *
 * @param {object} options
 * @param {string} options.prompt - The prompt to send to Gemini
 * @param {string} [options.stdinContent] - Optional content to pipe via stdin
 * @param {string} [options.model] - Override default model
 * @param {number} [options.timeoutMs] - Override default timeout
 * @returns {Promise<{ success: boolean, output: string, error?: string }>}
 */
export async function runGemini({ prompt, stdinContent, model, timeoutMs }) {
  const config = getConfig();
  const selectedModel = model || config.model;
  const timeout = timeoutMs || config.timeoutMs;

  const args = [
    '-p', prompt,
    '-m', selectedModel,
    '-o', 'text',
  ];

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn(config.geminiCliPath, args, {
      signal: ac.signal,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.name === 'AbortError' || ac.signal.aborted) {
        resolve({
          success: false,
          output: '',
          error: `Gemini CLI timed out after ${timeout}ms`,
        });
      } else {
        resolve({
          success: false,
          output: '',
          error: `Gemini CLI error: ${err.message}`,
        });
      }
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (stderr) {
        console.error(`[gemini-runner] stderr: ${stderr.slice(0, 500)}`);
      }

      if (code !== 0) {
        resolve({
          success: false,
          output: stdout,
          error: `Gemini CLI exited with code ${code}. ${stderr.slice(0, 300)}`,
        });
        return;
      }

      // Strip ANSI escape codes and gemini CLI status prefixes from output.
      // Gemini CLI may prepend "MCP issues detected. Run /mcp list for status."
      // directly on the same line as the actual response (no newline separator).
      const clean = stdout
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/MCP issues detected\. Run \/mcp list for status\./g, '')
        .trim();
      resolve({ success: true, output: clean });
    });

    // Pipe stdin content if provided, then close stdin.
    // Use callback to ensure large payloads are flushed before closing.
    if (stdinContent) {
      child.stdin.write(stdinContent, () => child.stdin.end());
    } else {
      child.stdin.end();
    }
  });
}
