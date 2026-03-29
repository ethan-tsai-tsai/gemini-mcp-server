import * as z from 'zod/v4';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { runGemini } from '../lib/gemini-runner.js';
import { sanitizePath, isBinaryFile } from '../lib/sanitize.js';

export const name = 'gemini_review';

export const config = {
  title: 'Gemini Code Review',
  description:
    'Get a code review from Gemini on specific files or a git diff. ' +
    'USE THIS TOOL WHEN: ' +
    '(1) You want a second opinion on code you just wrote or are about to commit. ' +
    '(2) You need to review a large diff that would consume too many tokens to analyze yourself. ' +
    '(3) You want a focused review on a specific aspect like performance, error handling, or readability. ' +
    '(4) You need to review multiple files together to check for cross-file consistency. ' +
    'This tool differs from gemini_analyze: it is designed for reviewing CHANGES (diffs, specific files) ' +
    'rather than analyzing an entire codebase. It provides actionable review comments with severity levels.',
  inputSchema: z.object({
    file_paths: z
      .array(z.string())
      .optional()
      .describe(
        'Array of absolute file paths to review. Binary files are automatically skipped. ' +
        'Provide this OR diff, not both.'
      ),
    diff: z
      .string()
      .optional()
      .describe(
        'A git diff string to review (e.g., output of `git diff` or `git diff --staged`). ' +
        'Provide this OR file_paths, not both. Preferred for reviewing changes before commit.'
      ),
    review_focus: z
      .string()
      .optional()
      .describe(
        'What aspect to focus the review on. Examples: "performance", "error handling", ' +
        '"readability", "security", "concurrency", "API design", "test coverage". ' +
        'If omitted, performs a general-purpose code review.'
      ),
    model: z
      .string()
      .optional()
      .describe(
        'Override the default Gemini model. If omitted, uses the server default.'
      ),
  }),
};

/**
 * @param {z.infer<typeof config.inputSchema>} params
 */
export async function handler({ file_paths, diff, review_focus, model }) {
  try {
    if (!file_paths?.length && !diff) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Provide either file_paths or diff for review.',
        }],
        isError: true,
      };
    }

    let stdinContent = '';

    if (diff) {
      stdinContent = `=== Git Diff ===\n${diff}`;
    } else {
      const parts = [];

      for (const filePath of file_paths) {
        try {
          const safePath = await sanitizePath(filePath);

          if (isBinaryFile(basename(safePath))) {
            parts.push(`--- ${safePath} ---\n[Binary file skipped]\n`);
            continue;
          }

          const content = await readFile(safePath, 'utf-8');
          parts.push(`--- ${safePath} ---\n${content}`);
        } catch (err) {
          parts.push(`--- ${filePath} ---\n[Error reading file: ${err.message}]\n`);
        }
      }

      stdinContent = parts.join('\n\n');
    }

    const focusInstruction = review_focus
      ? `Focus especially on: ${review_focus}.`
      : '';

    const prompt =
      'You are a senior software engineer conducting a thorough code review. ' +
      'For each issue found, provide: ' +
      '(1) Severity: CRITICAL / HIGH / MEDIUM / LOW / NIT. ' +
      '(2) Location: file name and approximate line or section. ' +
      '(3) Issue: clear description of the problem. ' +
      '(4) Suggestion: concrete fix or improvement. ' +
      `${focusInstruction} ` +
      'Also note any positive aspects or well-written sections. ' +
      'End with a brief overall assessment. ' +
      'If reviewing a diff, focus on the changed lines but consider surrounding context.';

    const result = await runGemini({ prompt, stdinContent, model });

    if (!result.success) {
      return {
        content: [{ type: 'text', text: `Code review failed: ${result.error}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: result.output }],
    };
  } catch (err) {
    console.error(`[gemini_review] Error: ${err.message}`);
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}
