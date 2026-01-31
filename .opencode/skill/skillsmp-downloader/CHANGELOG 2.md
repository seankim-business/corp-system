# Changelog - SkillsMP Downloader

## [2.0.0] - 2026-01-28

### 🎉 Major Update: Multi-Marketplace Architecture

#### Added
- **Multi-marketplace provider architecture** for unified skill search across multiple sources
- **SkillsMP Provider** - 107,805 skills from agentskills.in API
- **Anthropic Skills Provider** - 50+ official skills from github.com/anthropics/skills
- **MarketplaceManager** - Orchestrates parallel searches across all providers
- **Automatic deduplication** - Eliminates duplicate skills from different sources
- **Unified sorting** - Sort by stars, name, or recent across all marketplaces
- **Graceful fallback** - Continue working if any marketplace is unavailable

#### Architecture
```
MarketplaceManager
  ├── SkillsMPProvider (agentskills.in API)
  ├── AnthropicSkillsProvider (GitHub API)
  └── [Future providers: SkillsLLM, Agent-Skills.md, etc.]
```

#### New Files
- `src/api/marketplace-provider.ts` - Base provider interface
- `src/api/marketplace-manager.ts` - Multi-marketplace orchestrator
- `src/api/providers/skillsmp-provider.ts` - SkillsMP implementation
- `src/api/providers/anthropic-provider.ts` - Anthropic GitHub integration

#### Changed
- `src/commands/search.ts` - Now uses `marketplaceManager.searchAll()`
- `src/commands/install.ts` - Now uses `marketplaceManager.getSkillByName()`
- `SKILL.md` - Updated documentation for multi-marketplace support
- `package.json` - Version bumped to 2.0.0

#### Fixed
- TypeScript compilation errors after refactoring
- Missing imports in `install.ts` (`execAsync`, `getPlatformConfig`)
- All type errors resolved

#### Search Improvements
```typescript
// OLD: Single marketplace
const results = await skillsMPClient.searchSkills({ search: 'python' });

// NEW: All marketplaces simultaneously
const results = await marketplaceManager.searchAll({ search: 'python' });
// Returns: Skills from SkillsMP + Anthropic + future providers
```

#### Future Roadmap
Next marketplaces to integrate:
- **Agent-Skills.md** (6,910 skills) - Web scraping or API integration
- **SkillsLLM** (881 skills) - API integration
- **AI Agent Skills** (1,300+ skills) - API integration
- **Vercel Agent Skills** (CLI integration)
- **Hugging Face Skills** (ML/AI focused)
- **MCP Market** (624+ MCP servers)

#### Testing
- ✅ All tests passing
- ✅ Python search: Returns results from multiple marketplaces
- ✅ Excel search: Returns results from multiple marketplaces
- ✅ Top skills: Sorted across all sources
- ✅ TypeScript: Zero compilation errors

#### Deployment
Updated installations:
- ✅ `~/.config/opencode/skill/skillsmp-downloader/`
- ✅ `/Users/sean/Documents/Kyndof/tools/nubabel/.opencode/skill/skillsmp-downloader/`

---

## [1.0.0] - 2026-01-26

### Initial Release
- SkillsMP marketplace integration (107,805 skills)
- 10 platform support (Cursor, Claude, OpenCode, etc.)
- Search and install functionality
- TypeScript implementation
- Comprehensive documentation

---

**Total Skills Available**: 107,805+ (and growing with new marketplaces)
**Platforms Supported**: 10 AI agent platforms
**API Integrations**: 2 (SkillsMP, Anthropic) + more coming
