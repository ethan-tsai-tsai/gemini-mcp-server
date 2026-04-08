import * as z from 'zod/v4';
import { runGemini } from '../lib/gemini-runner.js';

export const name = 'gemini_search';

export const config = {
  title: 'Gemini Web Search',
  description:
    'Search the web using Gemini with Google Search grounding. ' +
    'USE THIS TOOL WHEN: ' +
    '(1) You need current, up-to-date information that may be beyond your training data. ' +
    '(2) You need to look up latest versions, release notes, or changelogs. ' +
    '(3) You need to research a topic with real-time web results. ' +
    '(4) You need to verify facts or find documentation URLs. ' +
    'Gemini will automatically search Google and synthesize results into a comprehensive answer ' +
    'with source citations. This is more powerful than a raw search engine — ' +
    'it reads, understands, and summarizes the search results.',
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'The search query or question. Be specific for better results. ' +
        'Examples: "Next.js 15 breaking changes", "CVE-2024-XXXX details and mitigation".'
      ),
    context: z
      .string()
      .optional()
      .describe(
        'Optional background context to help Gemini refine the search. ' +
        'For example: "I am migrating a Node.js 18 project to Node.js 22" ' +
        'helps Gemini focus on relevant migration-specific results.'
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
export async function handler({ query, context, model }) {
  try {
    const contextBlock = context
      ? `\nBackground context: ${context}\n`
      : '';

    const prompt =
      'Search the web for current, up-to-date information and provide a comprehensive answer. ' +
      `${contextBlock}` +
      `Query: ${query}\n\n` +
      'Instructions:\n' +
      '- Use google_web_search to find the most current information.\n' +
      '- Synthesize findings into a clear, well-structured answer.\n' +
      '- Cite sources with URLs where possible.\n' +
      '- If information conflicts between sources, note the discrepancy.\n' +
      '- Clearly state if information might be outdated or unverified.';

    const result = await runGemini({ prompt, model });

    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `Web search failed: ${result.error}\n\n${result.output || ''}`.trim(),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: result.output }],
    };
  } catch (err) {
    console.error(`[gemini_search] Unexpected error: ${err.message}`);
    return {
      content: [{ type: 'text', text: `Unexpected error: ${err.message}` }],
      isError: true,
    };
  }
}
