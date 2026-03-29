import * as z from 'zod/v4';
import { readFile } from 'node:fs/promises';
import { runGemini } from '../lib/gemini-runner.js';
import { sanitizePath, isBinaryFile } from '../lib/sanitize.js';

export const name = 'gemini_query';

export const config = {
  title: 'Gemini Query',
  description:
    'Send a query to Google Gemini with optional file context. ' +
    'Use this tool when you need to delegate a task that would consume a large amount of tokens — ' +
    'for example: reading and analyzing a very large file (>1000 lines), summarizing lengthy logs, ' +
    'getting a second opinion on complex analysis, or processing content that exceeds your comfortable context window. ' +
    'Gemini has a very large context window (1M+ tokens) and can handle these tasks efficiently. ' +
    'You can attach files as context by providing their absolute paths. ' +
    'Returns Gemini\'s text response.',
  inputSchema: z.object({
    prompt: z
      .string()
      .describe(
        'The question, instruction, or task for Gemini. Be specific and detailed for best results.'
      ),
    context_files: z
      .array(z.string())
      .optional()
      .describe(
        'Optional array of absolute file paths to include as context. ' +
        'The content of these files will be prepended to the prompt. ' +
        'Binary files (images, archives, etc.) are automatically skipped.'
      ),
    model: z
      .string()
      .optional()
      .describe(
        'Override the default Gemini model. Examples: "gemini-2.5-pro", "gemini-2.5-flash". ' +
        'If omitted, uses the server default (GEMINI_MODEL env var or gemini-2.5-pro).'
      ),
  }),
};

/**
 * @param {z.infer<typeof config.inputSchema>} params
 */
export async function handler({ prompt, context_files, model }) {
  try {
    let stdinContent = '';

    if (context_files && context_files.length > 0) {
      const fileContents = [];

      for (const filePath of context_files) {
        try {
          const safePath = await sanitizePath(filePath);

          if (isBinaryFile(safePath)) {
            fileContents.push(`--- ${safePath} ---\n[Binary file skipped]\n`);
            continue;
          }

          const content = await readFile(safePath, 'utf-8');
          fileContents.push(`--- ${safePath} ---\n${content}\n`);
        } catch (err) {
          fileContents.push(`--- ${filePath} ---\n[Error reading file: ${err.message}]\n`);
        }
      }

      stdinContent = fileContents.join('\n');
    }

    const result = await runGemini({ prompt, stdinContent, model });

    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `Gemini query failed: ${result.error}\n\n${result.output || ''}`.trim(),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: result.output }],
    };
  } catch (err) {
    console.error(`[gemini_query] Unexpected error: ${err.message}`);
    return {
      content: [{ type: 'text', text: `Unexpected error: ${err.message}` }],
      isError: true,
    };
  }
}
