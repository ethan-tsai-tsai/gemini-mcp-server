import * as z from 'zod/v4';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { runGemini } from '../lib/gemini-runner.js';
import { sanitizePath, isBinaryFile } from '../lib/sanitize.js';

export const name = 'gemini_pr_review';

export const config = {
  title: 'Gemini PR / Branch Review',
  description:
    'Review a pull request or branch diff using Gemini. ' +
    'USE THIS TOOL WHEN: ' +
    '(1) You want to review all changes in a PR or feature branch before merging. ' +
    '(2) You need a thorough review of a large diff that would consume too many tokens. ' +
    '(3) You want to compare changes between two branches or commits. ' +
    'This tool automatically fetches the git diff and optionally collects ' +
    'the full content of changed files for deeper context. ' +
    'It differs from gemini_review: this tool is git-aware and fetches diffs automatically, ' +
    'while gemini_review requires you to pass in the diff or file content manually.',
  inputSchema: z.object({
    base: z
      .string()
      .optional()
      .describe(
        'Base branch or commit to compare against. Defaults to "main". ' +
        'Examples: "main", "develop", "HEAD~5", "abc1234".'
      ),
    head: z
      .string()
      .optional()
      .describe(
        'Head branch or commit to review. Defaults to "HEAD" (current branch). ' +
        'Examples: "feature/auth", "HEAD", "def5678".'
      ),
    repo_path: z
      .string()
      .optional()
      .describe(
        'Absolute path to the git repository. Defaults to current working directory.'
      ),
    include_file_content: z
      .boolean()
      .optional()
      .describe(
        'If true, also sends the full content of changed files (not just the diff) ' +
        'for deeper context. Useful for complex refactors. Defaults to false.'
      ),
    review_focus: z
      .string()
      .optional()
      .describe(
        'What aspect to focus on. Examples: "security", "performance", ' +
        '"error handling", "API design", "backward compatibility". ' +
        'If omitted, performs a general-purpose review.'
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
 * Run a git command and return stdout.
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<{ success: boolean, output: string, error?: string }>}
 */
function runGit(args, cwd) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      resolve({ success: false, output: '', error: err.message });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, output: stdout, error: stderr.trim() });
      } else {
        resolve({ success: true, output: stdout });
      }
    });
  });
}

/**
 * @param {z.infer<typeof config.inputSchema>} params
 */
export async function handler({
  base = 'main',
  head = 'HEAD',
  repo_path,
  include_file_content = false,
  review_focus,
  model,
}) {
  try {
    const cwd = repo_path ? await sanitizePath(repo_path) : process.cwd();

    // Get the diff
    const diffResult = await runGit(
      ['diff', `${base}...${head}`, '--stat', '--patch'],
      cwd,
    );

    if (!diffResult.success) {
      return {
        content: [{
          type: 'text',
          text: `Failed to get git diff: ${diffResult.error}`,
        }],
        isError: true,
      };
    }

    if (!diffResult.output.trim()) {
      return {
        content: [{
          type: 'text',
          text: `No differences found between ${base} and ${head}.`,
        }],
      };
    }

    // Get commit log for context
    const logResult = await runGit(
      ['log', '--oneline', `${base}...${head}`],
      cwd,
    );

    let stdinContent = '';

    // Add commit log
    if (logResult.success && logResult.output.trim()) {
      stdinContent += `=== Commits (${base}...${head}) ===\n${logResult.output}\n\n`;
    }

    // Add diff
    stdinContent += `=== Diff (${base}...${head}) ===\n${diffResult.output}`;

    // Optionally collect full content of changed files
    if (include_file_content) {
      const namesResult = await runGit(
        ['diff', `${base}...${head}`, '--name-only'],
        cwd,
      );

      if (namesResult.success && namesResult.output.trim()) {
        const files = namesResult.output.trim().split('\n');
        const parts = [];

        for (const relPath of files) {
          if (isBinaryFile(basename(relPath))) continue;

          try {
            const fullPath = await sanitizePath(`${cwd}/${relPath}`);
            const content = await readFile(fullPath, 'utf-8');
            parts.push(`--- ${relPath} ---\n${content}`);
          } catch {
            // File may have been deleted in the diff; skip silently
          }
        }

        if (parts.length > 0) {
          stdinContent += `\n\n=== Full File Contents ===\n${parts.join('\n\n')}`;
        }
      }
    }

    const focusInstruction = review_focus
      ? `Pay special attention to: ${review_focus}.`
      : '';

    const prompt =
      'You are a senior software engineer conducting a thorough pull request review. ' +
      `You are reviewing changes from "${head}" compared against "${base}". ` +
      'Analyze the diff and provide a structured review.\n\n' +
      'For each issue found, provide:\n' +
      '(1) Severity: CRITICAL / HIGH / MEDIUM / LOW / NIT\n' +
      '(2) Location: file name and relevant line or hunk\n' +
      '(3) Issue: clear description of the problem\n' +
      '(4) Suggestion: concrete fix or improvement\n\n' +
      `${focusInstruction}\n` +
      'Also include:\n' +
      '- A summary of what the PR does (based on commits and diff)\n' +
      '- Positive aspects and well-written sections\n' +
      '- Potential risks or areas that need testing\n' +
      '- An overall assessment: APPROVE / REQUEST CHANGES / COMMENT';

    const result = await runGemini({ prompt, stdinContent, model });

    if (!result.success) {
      return {
        content: [{ type: 'text', text: `PR review failed: ${result.error}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: result.output }],
    };
  } catch (err) {
    console.error(`[gemini_pr_review] Error: ${err.message}`);
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}
