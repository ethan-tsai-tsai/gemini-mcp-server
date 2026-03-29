# Gemini MCP Server 開發指南 (Development Guidelines)

## 專案概述
本專案是一個基於 Node.js 的本地端 MCP (Model Context Protocol) Server。
其主要目的是將開發者本機端的 `gemini` CLI 工具，封裝成標準的 MCP Tools，讓 Claude Code 等支援 MCP 的客戶端可以呼叫，藉此利用 Gemini 的超大 Context Window 來處理消耗大量 Token 的任務（如：大型原始碼分析、Log 分析等）。

## 技術堆疊
* **運行環境：** Node.js (必須使用 ES Modules, 即 `package.json` 中設定 `"type": "module"`)
* **核心 SDK：** `@modelcontextprotocol/sdk`
* **資料驗證：** `zod`
* **系統操作：** Node.js 原生 `child_process` (執行外部 CLI)

## ⚠️ 核心開發鐵則 (Strict Rules)

### 1. 絕對禁止使用 `console.log` (STDIO 污染防制)
本 MCP Server 採用 `stdio` 作為與客戶端（Claude）通訊的 Transport。
**任何寫入 `stdout` 的非 JSON-RPC 格式資料都會導致通訊崩潰。**
* ❌ **禁止：** `console.log()`, `process.stdout.write()`
* ✅ **必須：** 所有除錯訊息、日誌、進度提示，**一律使用 `console.error()`** 輸出到 `stderr`。

### 2. 防範指令注入 (Command Injection Security)
由於本專案會將外部輸入（Claude 的參數）丟給 `child_process.exec` 執行，安全是第一要務。
* 任何來自 Tool Payload 的路徑 (`target_path`) 或字串 (`prompt`)，在拼湊成 Shell 指令前，必須進行跳脫 (Escape) 或嚴格驗證。
* 盡量使用 `child_process.spawn` 或 `execFile` 代替 `exec`，若必須使用 `exec`，請確保參數不會被解析為惡意系統指令（例如夾帶 `&& rm -rf /`）。

### 3. Tool Schema 的精準描述
定義 `server.tool()` 時，給予工具和參數的 `description` 必須極度清晰。
這些描述是給 Claude 的大腦看的，清楚的描述能確保 Claude 在正確的時機點呼叫正確的 Tool。

### 4. 優雅的錯誤處理 (Graceful Error Handling)
當 Gemini CLI 執行失敗或超時，MCP Server 不能直接 Crash。
* 必須用 `try...catch` 包覆執行邏輯。
* 發生錯誤時，請將錯誤訊息包裝成標準的 MCP 回傳格式 (例如：`return { content: [{ type: "text", text: "執行失敗: ..." }] }`) 回傳給客戶端，讓 Claude 知道發生了什麼事並決定下一步。

## 架構擴充指南
當你需要新增工具時，請遵循以下步驟：
1. 確認需求是否能透過本機端的 `gemini` CLI 或 Node.js 腳本達成。
2. 使用 `zod` 定義嚴謹的輸入參數 Schema。
3. 在 `server.tool(...)` 中註冊新工具。
4. 測試時透過 `console.error` 觀察參數傳遞是否正確。
