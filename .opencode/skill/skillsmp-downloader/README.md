# SkillsMP Downloader Skill

Download and install AI agent skills from the SkillsMP marketplace (67,000+ skills).

## Quick Start

**For AI Agents:**
This skill enables you to search and install skills from https://agentskills.in marketplace.

**Example User Commands:**
- "Search for Python skills on SkillsMP"
- "Install the xlsx skill to Cursor"
- "Download @anthropic/pdf skill globally"
- "Show me the top 20 skills by stars"

## Features

- ✅ Search 67,000+ skills from agentskills.in API
- ✅ Install to 10 AI platforms (Cursor, Claude Code, OpenCode, etc.)
- ✅ GitHub integration for direct downloads
- ✅ Global or project-level installation
- ✅ Parallel batch installations
- ✅ Star rankings and author filtering

## Installation Paths

| Platform | Project | Global |
|----------|---------|--------|
| Cursor | `.cursor/skills/` | `~/.cursor/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| OpenCode | `.opencode/skill/` | `~/.config/opencode/skill/` |
| GitHub Copilot | `.github/skills/` | `~/.github/skills/` |
| Antigravity | `.agent/skills/` | `~/.gemini/antigravity/skills/` |
| Amp | `.agents/skills/` | `~/.config/agents/skills/` |
| Kilo Code | `.kilocode/skills/` | `~/.kilocode/skills/` |
| Roo Code | `.roo/skills/` | `~/.roo/skills/` |
| Goose | `.goose/skills/` | `~/.config/goose/skills/` |
| OpenAI Codex | `.codex/skills/` | `~/.codex/skills/` |

## API Reference

**Base URL:** `https://www.agentskills.in/api/skills`

**Search Endpoint:**
```
GET /api/skills?search=python&sortBy=stars&limit=20
```

**Response:**
```json
{
  "skills": [
    {
      "name": "python-expert",
      "author": "anthropic",
      "scoped_name": "anthropic/python-expert",
      "description": "Expert Python coding assistance",
      "stars": 1245,
      "github_url": "https://github.com/...",
      "raw_url": "https://raw.githubusercontent.com/..."
    }
  ],
  "total": 67000
}
```

## Usage Examples

See `examples/` directory for detailed implementation examples.

## Reference Implementation

Official CLI: https://github.com/Karanjot786/agent-skills-cli
- 67,000+ skills indexed
- Multi-platform support
- Fast parallel downloads

## License

MIT
