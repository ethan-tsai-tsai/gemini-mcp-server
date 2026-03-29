#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import * as geminiQuery from './tools/gemini-query.js';
import * as geminiSummarize from './tools/gemini-summarize.js';
import * as geminiAnalyze from './tools/gemini-analyze.js';
import * as geminiReview from './tools/gemini-review.js';

// --- Server Initialization ---

const server = new McpServer({
  name: 'gemini-mcp-server',
  version: '1.0.0',
});

// --- Tool Registration ---

const tools = [geminiQuery, geminiSummarize, geminiAnalyze, geminiReview];

for (const tool of tools) {
  server.tool(
    tool.name,
    tool.config.description,
    tool.config.inputSchema.shape,
    async (params) => tool.handler(params),
  );
}

// --- Transport & Startup ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[gemini-mcp-server] Server started — ${tools.length} tools registered`);
}

main().catch((err) => {
  console.error(`[gemini-mcp-server] Fatal error: ${err.message}`);
  process.exit(1);
});
