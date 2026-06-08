<div align="center">

# CodeGG

### Local-first code intelligence graph for AI coding agents

**Zero-config · Zero external APIs · 100% local**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/Node-22.5%2B-brightgreen)](https://nodejs.org/)

[![Windows](https://img.shields.io/badge/Windows-supported-blue.svg)](#supported-platforms)
[![macOS](https://img.shields.io/badge/macOS-supported-blue.svg)](#supported-platforms)
[![Linux](https://img.shields.io/badge/Linux-supported-blue.svg)](#supported-platforms)

[![Claude Code](https://img.shields.io/badge/Claude_Code-supported-blueviolet.svg)](#supported-agents)
[![Cursor](https://img.shields.io/badge/Cursor-supported-blueviolet.svg)](#supported-agents)
[![Codex](https://img.shields.io/badge/Codex-supported-blueviolet.svg)](#supported-agents)
[![opencode](https://img.shields.io/badge/opencode-supported-blueviolet.svg)](#supported-agents)

<br>

</div>

## What is CodeGG?

CodeGG is a **local-first code intelligence engine** that parses your codebase with [tree-sitter](https://tree-sitter.github.io/), builds a **SQLite knowledge graph** of every symbol, call, and relationship, and exposes it to AI coding agents over **MCP** (Model Context Protocol).

Instead of your agent spending time grepping, globbing, and reading files to understand your code, CodeGG answers structural questions instantly:

- "How does a request reach the database?"
- "What calls this function?"
- "What would change X break?"
- "Where is this symbol defined?"

**One `codegg_explore` call** returns the relevant source, the call flow, and the impact radius — usually with **zero file reads**.

### How it works

```
Your Agent (Claude Code / Cursor / Codex CLI / opencode)
    │  "How does login work?"
    │  calls codegg_explore → returns source + flow + impact
    ▼
CodeGG MCP Server
    │
    ▼
SQLite knowledge graph (100% local)
    symbols · edges · files · FTS5 full-text search
```

### Pipeline

1. **Extraction** — tree-sitter parses source into ASTs. Per-language queries extract nodes (functions, classes, methods) and edges (calls, imports, inheritance).
2. **Storage** — everything goes into a local SQLite database (`.codegg/codegg.db`) with FTS5 full-text search.
3. **Resolution** — references are resolved: function calls → definitions, imports → files, framework routing patterns, and dynamic dispatch bridges.
4. **Auto-sync** — the MCP server watches your project with native OS file events. Changes are debounced and incrementally synced. No configuration needed.

---

## Quick Start

### 1. Install

```bash
npm i -g @jonusnattapong/codegg
```

### 2. Wire up your agents

```bash
codegg install
```

Auto-detects Claude Code, Cursor, Codex CLI, and opencode — configures their MCP servers automatically.

### 3. Index a project

```bash
cd your-project
codegg init -i
```

That's it. Open your agent and ask a structural question.

---

## Key Features

| | |
|---|---|
| **One-tool answers** | `codegg_explore` returns source + call flow + impact in a single call |
| **Full-text search** | FTS5-powered symbol search across the entire codebase |
| **Impact analysis** | Trace callers, callees, and transitive dependencies before changing code |
| **Auto-sync** | Native file watcher — the graph stays fresh as you code |
| **20+ languages** | TypeScript, Python, Go, Rust, Java, C#, PHP, Ruby, C/C++, Swift, Kotlin, Dart, and more |
| **Framework-aware** | Django, FastAPI, Spring, Express, NestJS, Gin, Rails, Laravel, ASP.NET, React Router, and more |
| **Dynamic dispatch** | Bridges React render, JSX children, Vue/Svelte templates, Django signals, FastAPI Depends, event emitters, callback observers, and more |
| **100% local** | No data leaves your machine. No API keys. No external services |

---

## CLI Reference

```bash
codegg                         # Interactive installer
codegg install                 # Run installer
codegg uninstall               # Remove CodeGG from agents
codegg init [path]             # Initialize project (--index to also index)
codegg uninit [path]           # Remove CodeGG from a project
codegg index [path]            # Full index (--force to re-index)
codegg sync [path]             # Incremental update
codegg status [path]           # Show index stats
codegg query <search>          # Search symbols
codegg files [path]            # Show file structure
codegg callers <symbol>        # Find callers of a symbol
codegg callees <symbol>        # Find what a symbol calls
codegg impact <symbol>         # Analyze impact of changes
codegg serve --mcp             # Start MCP server
```

---

## MCP Tools

When running as an MCP server, CodeGG exposes:

| Tool | What it does |
|---|---|
| `codegg_explore` | **Primary tool.** Returns relevant source + call flow + impact in one call |
| `codegg_search` | Search by symbol name |
| `codegg_callers` | Find what calls a symbol |
| `codegg_callees` | Find what a symbol calls |
| `codegg_impact` | Transitive impact analysis |
| `codegg_node` | Full source for one symbol (returns every overload) |
| `codegg_files` | Indexed file structure |
| `codegg_status` | Index health |

---

## Supported Languages

TypeScript, JavaScript, Python, Go, Rust, Java, C#, PHP, Ruby, C, C++, Objective-C, Swift, Kotlin, Scala, Dart, Lua, Luau, Svelte, Vue, Liquid, Pascal/Delphi.

---

## Supported Agents

- **Claude Code**
- **Cursor**
- **Codex CLI**
- **opencode**

---

## Why CodeGG?

AI agents are powerful, but exploring an unfamiliar codebase costs them tokens on every grep/Read/glob. CodeGG pre-indexes everything so your agent answers structural questions with **one MCP call** instead of dozens of file reads — cutting **tool calls by ~58% and cost by ~16%** on typical architecture questions.

---

## License

MIT
