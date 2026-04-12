# Kiloclaw Configuration Guide

Comprehensive guide for configuring Kiloclaw CLI: commands, agents, MCP servers, skills, permissions, instructions, plugins, providers, all kilo.json fields, and TUI settings.

## Configuration File Locations

Kiloclaw loads configuration from multiple locations with this precedence (highest to lowest):

1. **Project config**: `.kilo/kilo.json` or `.kilo/kilo.jsonc`
2. **Project config (legacy)**: `kilo.json` or `kilo.jsonc` in project root
3. **Global config**: `~/.config/kilo/kilo.json` or `~/.config/kilo/kilo.jsonc`
4. **System config**: `/etc/kilo/` (enterprise, admin-controlled)

## Core Configuration Fields

### Model Selection

```json
{
  "model": "anthropic/claude-3-5-sonnet",
  "small_model": "anthropic/claude-3-haiku"
}
```

- **model**: Primary model for agent tasks in `provider/model` format
- **small_model**: Lightweight model for辅助 tasks like title generation

### Agent Configuration

```json
{
  "agent": {
    "plan": { "model": "anthropic/claude-3-5-sonnet" },
    "build": { "model": "anthropic/claude-3-5-sonnet" },
    "debug": { "tools": ["Read", "Edit", "Grep", "Bash"] },
    "orchestrator": { "model": "anthropic/claude-3-5-sonnet" },
    "ask": { "model": "anthropic/claude-3-5-sonnet" },
    "general": { "model": "anthropic/claude-3-5-sonnet" },
    "explore": { "tools": ["Read", "Grep", "Glob"] },
    "title": { "model": "anthropic/claude-3-haiku" },
    "summary": { "model": "anthropic/claude-3-haiku" }
  }
}
```

Primary agents: `plan`, `build`, `debug`, `orchestrator`, `ask`
Sub-agents: `general`, `explore`
Specialized agents: `title`, `summary`, `compaction`

### Provider Configuration

```json
{
  "provider": {
    "anthropic": {
      "api_key": "sk-...",
      "base_url": "https://api.anthropic.com"
    },
    "openai": {
      "api_key": "sk-...",
      "base_url": "https://api.openai.com/v1"
    }
  }
}
```

### MCP Servers

```json
{
  "mcp": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    }
  }
}
```

### Commands

```json
{
  "command": {
    "mycommand": {
      "description": "What this command does",
      "instruction": "path/to/instruction.md"
    }
  }
}
```

Place command files in `.kilo/command/*.md`.

### Skills

```json
{
  "skills": ["/path/to/custom/skills"]
}
```

Skill files should be `.md` files with frontmatter containing `name` and `description`.

### Permissions

```json
{
  "permission": {
    "bash": "allow|deny|ask",
    "browser": "allow|deny|ask",
    "edit": "allow|deny|ask",
    "glob": "allow|deny|ask",
    "grep": "allow|deny|ask",
    "read": "allow|deny|ask",
    "write": "allow|deny|ask"
  }
}
```

Permission values:

- `allow`: Always permit
- `deny`: Always deny
- `ask`: Prompt for confirmation each time

### Plugins

```json
{
  "plugin": ["@kilocode/plugin-example"]
}
```

### Instructions

```json
{
  "instructions": [".kilo/instructions.md"]
}
```

## TUI Settings

TUI configuration is stored in `~/.config/kilo/tui.json`:

```json
{
  "theme": "default",
  "themes": {
    "default": {
      "background": "#1a1a2e",
      "foreground": "#eeeaea",
      "accent": "#e94560"
    }
  },
  "keybinds": {
    "ctrl+p": "command-palette",
    "ctrl+b": "toggle-sidebar",
    "ctrl+c": "copy"
  }
}
```

### Theme Colors

| Field      | Description            |
| ---------- | ---------------------- |
| background | Main background color  |
| foreground | Primary text color     |
| accent     | Highlight/accent color |
| secondary  | Secondary text color   |
| error      | Error state color      |
| success    | Success state color    |

### Keybinds

Common keybindings:

- `ctrl+p` - Open command palette
- `ctrl+b` - Toggle sidebar
- `ctrl+n` - New session
- `ctrl+w` - Close current tab
- `ctrl+r` - Rename session
- `ctrl+k` - Quick actions

## Other Settings

### Logging

```json
{
  "logLevel": "info"
}
```

Options: `debug`, `info`, `warn`, `error`

### Sharing

```json
{
  "share": "manual|auto|disabled"
}
```

- `manual`: Share via commands only
- `auto`: Automatically share new sessions
- `disabled`: Disable all sharing

### Auto-Update

```json
{
  "autoupdate": true
}
```

Options: `true` (auto-update), `false` (disable), `"notify"` (show notifications)

### Remote Control

```json
{
  "remote_control": false
}
```

Enable remote control via Kilo Cloud.

### Compaction

```json
{
  "compaction": {
    "auto": true,
    "prune": true,
    "reserved": 5000
  }
}
```

Controls context compaction when memory is full.

### Experimental Features

```json
{
  "experimental": {
    "disable_paste_summary": false,
    "batch_tool": false,
    "codebase_search": false,
    "openTelemetry": true,
    "mcp_timeout": 60000
  }
}
```

## Example kilo.json

```json
{
  "$schema": "https://app.kilo.ai/config.json",
  "model": "anthropic/claude-3-5-sonnet",
  "small_model": "anthropic/claude-3-haiku",
  "agent": {
    "build": {
      "model": "anthropic/claude-3-5-sonnet",
      "tools": ["Read", "Edit", "Grep", "Glob", "Bash"]
    }
  },
  "permission": {
    "bash": "ask",
    "browser": "ask",
    "edit": "allow",
    "read": "allow"
  },
  "mcp": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```
