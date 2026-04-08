<p align="center">
  <h1 align="center">Gemini MCP Server</h1>
  <p align="center">
    Let Claude Code delegate token-heavy tasks to Gemini's 1M+ token context window.
  </p>
</p>

<p align="center">
  <a href="https://github.com/ethan-tsai-tsai/gemini-mcp-server/blob/main/LICENSE"><img src="https://img.shields.io/github/license/ethan-tsai-tsai/gemini-mcp-server" alt="License" /></a>
  <a href="https://github.com/ethan-tsai-tsai/gemini-mcp-server/stargazers"><img src="https://img.shields.io/github/stars/ethan-tsai-tsai/gemini-mcp-server" alt="Stars" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-18+-green.svg" alt="Node 18+" /></a>
</p>

---

## What is this?

A local MCP server that wraps the [`gemini` CLI](https://github.com/google-gemini/gemini-cli), letting any MCP client (Claude Code, Cursor, etc.) offload expensive tasks to Gemini 2.5 Pro's massive context window.

**Use cases:**
- Summarize a 5,000-line file without burning Claude's tokens
- Analyze an entire codebase directory in one shot
- Get a second-opinion code review from a different model
- Process huge logs or data files that exceed comfortable context limits
- Search the web for up-to-date information via Google Search grounding
- Review a PR or branch diff automatically without manual copy-paste

## MCP Tools

| Tool | Description |
|------|-------------|
| `gemini_query` | Send a prompt to Gemini with optional file context |
| `gemini_summarize` | Summarize a file or entire directory/codebase |
| `gemini_analyze` | Deep analysis of codebase structure, patterns, and issues |
| `gemini_review` | Code review with actionable feedback (manual diff/files) |
| `gemini_search` | Web search with Google Search grounding — get current info with source citations |
| `gemini_pr_review` | Git-aware PR/branch review — auto-fetches diff and commit history |

## Prerequisites

- Node.js 18+
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) installed and authenticated (`npm install -g @anthropic-ai/gemini-cli` or similar)

## Quick Start

```bash
git clone https://github.com/ethan-tsai-tsai/gemini-mcp-server.git
cd gemini-mcp-server
npm install
```

### Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "gemini": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-mcp-server/src/index.js"]
    }
  }
}
```

<details>
<summary><strong>Claude Code</strong></summary>

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "gemini": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-mcp-server/src/index.js"]
    }
  }
}
```

Or run: `claude mcp add gemini -- node /absolute/path/to/gemini-mcp-server/src/index.js`

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "gemini": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-mcp-server/src/index.js"]
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Go to **Cursor Settings > MCP > Add new MCP Server**, then add:

```json
{
  "mcpServers": {
    "gemini": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-mcp-server/src/index.js"]
    }
  }
}
```

</details>

<details>
<summary><strong>VS Code (Copilot)</strong></summary>

Add to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "gemini": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-mcp-server/src/index.js"]
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "gemini": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-mcp-server/src/index.js"]
    }
  }
}
```

</details>

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_CLI_PATH` | `gemini` | Path to the gemini binary |
| `GEMINI_MODEL` | `gemini-2.5-pro` | Default Gemini model |
| `GEMINI_TIMEOUT_MS` | `120000` | Timeout per invocation (ms) |

## How It Works

```
┌─────────────┐     MCP (stdio)     ┌──────────────┐    child_process    ┌─────────────┐
│  AI Client  │ ◄──────────────────► │  index.js    │ ◄────────────────► │  gemini CLI  │
│ (Claude,    │   gemini_query()     │  (MCP Server)│   spawn/execFile   │  (Google)    │
│  Cursor...) │   gemini_summarize() │              │                    │              │
│             │   gemini_analyze()   │              │                    │              │
│             │   gemini_review()    │              │                    │              │
│             │   gemini_search()    │              │                    │              │
│             │   gemini_pr_review() │              │                    │              │
└─────────────┘                      └──────────────┘                    └─────────────┘
```

## Security

- **No `console.log`** — stdout is reserved for JSON-RPC; all logging uses `stderr`
- **No shell injection** — Uses `spawn`/`execFile` instead of `exec`; all inputs are sanitized
- **Binary files skipped** — Automatically detects and skips non-text files
- **Path validation** — All file paths are sanitized before use

## License

[ISC](LICENSE)
