# Gemini MCP Server

## Project Overview
Node.js MCP server wrapping `gemini` CLI, enabling Claude Code to delegate token-heavy tasks to Gemini.

## Tech Stack
- Node.js ES Modules (`"type": "module"`)
- `@modelcontextprotocol/sdk` for MCP server
- `zod` v4 for schema validation
- `child_process.spawn` for CLI execution

## Commands
- `npm start` — Run the MCP server
- `npm test` — Run tests with vitest

## Development Rules
See `guild.md` for strict rules. Key points:
- **NEVER use `console.log`** — stdout is reserved for JSON-RPC. Use `console.error` for all debug/logging.
- **Prevent command injection** — Use `spawn`/`execFile`, never `exec`. Validate all paths and inputs.
- **Graceful errors** — Catch all errors, return MCP-formatted error responses. Never crash.
- **Clear tool descriptions** — These are read by Claude to decide when to call tools.

## Architecture
```
src/
  index.js              # Server entry point
  lib/
    config.js           # Environment variable config
    sanitize.js         # Input validation & sanitization
    gemini-runner.js    # Core gemini CLI wrapper
    collect-files.js    # Recursive file collection
  tools/
    gemini-query.js     # General-purpose query
    gemini-summarize.js # File/directory summarization
    gemini-analyze.js   # Deep codebase analysis
    gemini-review.js    # Code review (manual diff/files)
    gemini-search.js    # Web search with Google grounding
    gemini-pr-review.js # Git-aware PR/branch review
```

## Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_CLI_PATH` | `gemini` | Path to gemini binary |
| `GEMINI_MODEL` | `gemini-2.5-pro` | Default model |
| `GEMINI_TIMEOUT_MS` | `120000` | Timeout per invocation (ms) |
