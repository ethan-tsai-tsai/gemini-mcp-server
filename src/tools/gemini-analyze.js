import * as z from 'zod/v4';
import { stat as fsStat, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { runGemini } from '../lib/gemini-runner.js';
import { sanitizePath, isBinaryFile } from '../lib/sanitize.js';
import { collectFiles } from '../lib/collect-files.js';

const ANALYSIS_PROMPTS = {
  architecture:
    'Analyze the architecture of this codebase. Identify: ' +
    '(1) Overall architectural pattern (MVC, layered, microservice, etc.), ' +
    '(2) Module boundaries and their responsibilities, ' +
    '(3) Data flow between components, ' +
    '(4) Entry points and external interfaces, ' +
    '(5) Potential architectural concerns or improvements.',

  dependencies:
    'Analyze the dependencies of this codebase. Identify: ' +
    '(1) External package dependencies and their purposes, ' +
    '(2) Internal module dependency graph, ' +
    '(3) Circular or tangled dependencies, ' +
    '(4) Outdated or potentially risky dependencies, ' +
    '(5) Dependency injection patterns (if any).',

  patterns:
    'Identify coding patterns and conventions used in this codebase: ' +
    '(1) Design patterns (factory, observer, strategy, etc.), ' +
    '(2) Error handling conventions, ' +
    '(3) Naming conventions and code style, ' +
    '(4) State management approaches, ' +
    '(5) Testing patterns (if tests are present).',

  bugs:
    'Perform a bug analysis on this codebase. Look for: ' +
    '(1) Potential null/undefined reference errors, ' +
    '(2) Race conditions or concurrency issues, ' +
    '(3) Resource leaks (file handles, connections, memory), ' +
    '(4) Off-by-one errors or boundary condition issues, ' +
    '(5) Unhandled error paths. ' +
    'Rate each finding as HIGH/MEDIUM/LOW severity.',

  security:
    'Perform a security analysis on this codebase. Check for: ' +
    '(1) Injection vulnerabilities (SQL, command, XSS, etc.), ' +
    '(2) Authentication and authorization weaknesses, ' +
    '(3) Sensitive data exposure (hardcoded secrets, logging PII), ' +
    '(4) Insecure configurations or defaults, ' +
    '(5) OWASP Top 10 vulnerabilities. ' +
    'Rate each finding as CRITICAL/HIGH/MEDIUM/LOW.',
};

export const name = 'gemini_analyze';

export const config = {
  title: 'Gemini Analyze',
  description:
    'Perform deep, structured analysis of a codebase or file using Gemini. ' +
    'USE THIS TOOL WHEN: ' +
    '(1) You need to understand the architecture of a large, unfamiliar project. ' +
    '(2) You want to audit code for bugs or security vulnerabilities across many files. ' +
    '(3) You need to map out dependencies or identify design patterns in a codebase. ' +
    '(4) You have a specific analytical question about a codebase that requires reading many files. ' +
    'This tool is MORE STRUCTURED than gemini_summarize — it uses specialized prompts for each ' +
    'analysis type and produces categorized, actionable findings. ' +
    'Automatically filters out node_modules, .git, binary files, and other non-essential content.',
  inputSchema: z.object({
    target_path: z
      .string()
      .describe(
        'Absolute path to the file or directory to analyze.'
      ),
    analysis_type: z
      .enum(['architecture', 'dependencies', 'patterns', 'bugs', 'security'])
      .describe(
        'Type of analysis to perform: ' +
        '"architecture" — module boundaries, data flow, entry points. ' +
        '"dependencies" — external/internal deps, circular deps, risks. ' +
        '"patterns" — design patterns, conventions, coding style. ' +
        '"bugs" — potential bugs, race conditions, resource leaks. ' +
        '"security" — injection, auth, secrets, OWASP Top 10.'
      ),
    specific_question: z
      .string()
      .optional()
      .describe(
        'An additional specific question to answer about the code. ' +
        'This is appended to the analysis prompt for focused results. ' +
        'Example: "Is the database connection pool properly managed?"'
      ),
    max_depth: z
      .number()
      .optional()
      .describe(
        'Maximum directory traversal depth (default: 5). Only applies to directories.'
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
export async function handler({ target_path, analysis_type, specific_question, max_depth, model }) {
  try {
    const safePath = await sanitizePath(target_path);
    const pathStat = await fsStat(safePath);
    let stdinContent;
    let contextDescription;

    if (pathStat.isDirectory()) {
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
        `Truncated: ${collected.truncated ? 'Yes' : 'No'}`;

      stdinContent = `${contextDescription}\n\n${collected.content}`;
    } else {
      if (isBinaryFile(basename(safePath))) {
        return {
          content: [{ type: 'text', text: `Cannot analyze binary file: ${safePath}` }],
          isError: true,
        };
      }

      const fileContent = await readFile(safePath, 'utf-8');
      contextDescription = `File: ${safePath} (${fileContent.split('\n').length} lines)`;
      stdinContent = `${contextDescription}\n\n${fileContent}`;
    }

    const basePrompt = ANALYSIS_PROMPTS[analysis_type];
    const extra = specific_question
      ? `\n\nAdditionally, answer this specific question: ${specific_question}`
      : '';

    const prompt =
      `You are a senior software engineer performing a ${analysis_type} analysis. ` +
      `${basePrompt}${extra} ` +
      'Structure your response with clear headers and bullet points. ' +
      'Be specific — reference file names and line-level details when possible.';

    const result = await runGemini({ prompt, stdinContent, model });

    if (!result.success) {
      return {
        content: [{ type: 'text', text: `Analysis failed: ${result.error}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: result.output }],
    };
  } catch (err) {
    console.error(`[gemini_analyze] Error: ${err.message}`);
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}
