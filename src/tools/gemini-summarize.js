import * as z from 'zod/v4';
import { readFile, stat as fsStat } from 'node:fs/promises';
import { basename } from 'node:path';
import { runGemini } from '../lib/gemini-runner.js';
import { sanitizePath, isBinaryFile } from '../lib/sanitize.js';
import { collectFiles } from '../lib/collect-files.js';

export const name = 'gemini_summarize';

export const config = {
  title: 'Gemini Summarize',
  description:
    'Summarize a file or an entire directory/codebase using Gemini\'s large context window. ' +
    'USE THIS TOOL WHEN: ' +
    '(1) You need a quick overview of a large file (>500 lines) without reading it yourself. ' +
    '(2) You need to understand the structure and purpose of an unfamiliar codebase or directory. ' +
    '(3) You want to summarize lengthy logs, documentation, or data files. ' +
    'For directories, this tool automatically traverses the file tree, skipping node_modules, .git, ' +
    'binary files, and other non-essential content. It respects a ~4MB total content limit to stay ' +
    'within Gemini\'s context window. Returns a structured summary from Gemini.',
  inputSchema: z.object({
    target_path: z
      .string()
      .describe(
        'Absolute path to a file or directory to summarize. ' +
        'For directories, all text files will be recursively collected (with filtering).'
      ),
    focus: z
      .string()
      .optional()
      .describe(
        'Optional focus area for the summary. Examples: "architecture", "API endpoints", ' +
        '"error handling patterns", "data flow", "configuration options". ' +
        'If omitted, Gemini provides a general-purpose summary.'
      ),
    max_depth: z
      .number()
      .optional()
      .describe(
        'Maximum directory traversal depth (default: 5). Only applies to directories. ' +
        'Use a smaller value (1-2) for shallow overviews of large monorepos.'
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
export async function handler({ target_path, focus, max_depth, model }) {
  try {
    const safePath = await sanitizePath(target_path);
    const pathStat = await fsStat(safePath);
    let stdinContent;
    let contextDescription;

    if (pathStat.isDirectory()) {
      // --- Directory mode ---
      const collected = await collectFiles(safePath, { maxDepth: max_depth ?? 5 });

      if (collected.fileCount === 0) {
        return {
          content: [{
            type: 'text',
            text: `No text files found in ${safePath} (${collected.skippedCount} files/dirs skipped by filters).`,
          }],
        };
      }

      contextDescription =
        `Directory: ${safePath}\n` +
        `Files collected: ${collected.fileCount}\n` +
        `Skipped (binary/ignored): ${collected.skippedCount}\n` +
        `Truncated: ${collected.truncated ? 'Yes (exceeded size limit)' : 'No'}`;

      stdinContent = `${contextDescription}\n\n${collected.content}`;
    } else {
      // --- Single file mode ---
      if (isBinaryFile(basename(safePath))) {
        return {
          content: [{
            type: 'text',
            text: `Cannot summarize binary file: ${safePath}`,
          }],
          isError: true,
        };
      }

      const fileContent = await readFile(safePath, 'utf-8');
      contextDescription = `File: ${safePath} (${fileContent.split('\n').length} lines)`;
      stdinContent = `${contextDescription}\n\n${fileContent}`;
    }

    const focusInstruction = focus
      ? `Focus your summary on: ${focus}.`
      : '';

    const prompt =
      'You are a senior software engineer. Summarize the provided code/content thoroughly. ' +
      'Include: (1) Overall purpose and architecture, (2) Key components and their responsibilities, ' +
      '(3) Important patterns or conventions, (4) Notable dependencies or integrations. ' +
      `${focusInstruction} ` +
      'Use clear structure with headers. Respond in the same language as the code comments ' +
      '(default to English if no comments).';

    const result = await runGemini({ prompt, stdinContent, model });

    if (!result.success) {
      return {
        content: [{ type: 'text', text: `Summarization failed: ${result.error}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: result.output }],
    };
  } catch (err) {
    console.error(`[gemini_summarize] Error: ${err.message}`);
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}
