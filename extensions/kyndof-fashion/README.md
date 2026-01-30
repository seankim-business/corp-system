# Kyndof Fashion Industry Extension

패션 산업을 위한 Nubabel 확장 패키지입니다. CLO3D 3D 디자인 도구와 통합되어 의류 디자인, 생산 관리, 품질 검사 워크플로우를 제공합니다.

## 구조

```
kyndof-fashion/
├── extension.yaml              # Extension manifest
├── index.ts                    # Main entry point
├── README.md                   # Documentation
│
├── agents/                     # 4 specialized agents
│   ├── fashion-designer.yaml
│   ├── production-manager.yaml
│   ├── quality-inspector.yaml
│   └── collection-manager.yaml
│
├── skills/                     # 5 domain skills
│   ├── garment-design.yaml
│   ├── pattern-making.yaml
│   ├── quality-check.yaml
│   ├── production-planning.yaml
│   └── material-sourcing.yaml
│
├── hooks/                      # Lifecycle hooks
│   ├── onInstall.ts           # Installation logic
│   ├── onUninstall.ts         # Cleanup logic
│   └── onUpdate.ts            # Migration logic
│
├── mcp/                        # MCP tool integrations
│   └── clo3d/                 # CLO3D integration
│       ├── index.ts           # MCP server entry
│       ├── client.ts          # API client
│       └── tools/             # Individual tools
│           ├── getDesigns.ts
│           ├── exportPattern.ts
│           └── render3D.ts
│
└── workflows/                  # Production workflows
    ├── collection-production.yaml
    ├── sample-review.yaml
    └── quality-inspection.yaml
```

## Components

### Agents (4)

1. **fashion-designer** - 패션 디자인 전문
   - Skills: garment-design, pattern-making, material-sourcing
   - Tools: CLO3D, Notion, Drive, Slack

2. **production-manager** - 생산 관리 전문
   - Skills: production-planning, material-sourcing
   - Tools: Notion, Slack

3. **quality-inspector** - 품질 검사 전문
   - Skills: quality-check
   - Tools: Notion, Slack

4. **collection-manager** - 컬렉션 기획 및 조정
   - Skills: All 5 skills
   - Tools: All tools

### Skills (5)

1. **garment-design** - 의류 디자인 스킬
   - 실루엣, 디테일, 컬러 설계
   - CLO3D 3D 모델링

2. **pattern-making** - 패턴 제작 스킬
   - 패턴 설계 및 그레이딩
   - 기술 사양서 작성

3. **quality-check** - 품질 검사 스킬
   - 샘플 검수
   - 치수 검사

4. **production-planning** - 생산 계획 스�ل
   - 일정 관리
   - 자재 소요 계산

5. **material-sourcing** - 소재 소싱 스킬
   - 원단 선정
   - 부자재 조달

### MCP Tools (3)

1. **clo3d__getDesigns** - CLO3D 디자인 목록 조회
   - Input: collectionId?, season?, status?
   - Output: Design[]

2. **clo3d__exportPattern** - 패턴 파일 내보내기
   - Input: designId, format (dxf/pdf/ai)
   - Output: PatternExportResult

3. **clo3d__render3D** - 3D 렌더링 생성
   - Input: designId, angle?, quality?
   - Output: RenderResult

### Workflows (3)

1. **collection-production** - 컬렉션 생산 프로세스
2. **sample-review** - 샘플 리뷰 워크플로우
3. **quality-inspection** - 품질 검사 워크플로우

## Installation

### Prerequisites

- Nubabel >= 2.0.0
- CLO3D API access
- Notion workspace (optional)
- Google Drive (optional)
- Slack workspace (optional)

### Configuration

Required:
- `clo3dApiKey` - CLO3D API 키
- `clo3dWorkspace` - CLO3D 워크스페이스 ID

Optional:
- `clo3dApiUrl` - API endpoint (default: https://api.clo3d.com/v1)
- `productionNotionDb` - 생산 관리 Notion DB ID
- `qualityNotionDb` - 품질 검사 Notion DB ID
- `collectionNotionDb` - 컬렉션 관리 Notion DB ID
- `slackChannel` - Slack 알림 채널 (default: #fashion-alerts)

### Setup

```bash
# 1. Extension 설치 (Nubabel UI에서)
# 2. CLO3D 연동 설정
{
  "clo3dApiKey": "your-api-key",
  "clo3dWorkspace": "workspace-id",
  "clo3dApiUrl": "https://api.clo3d.com/v1"
}

# 3. Notion DB 연동 (선택)
{
  "productionNotionDb": "database-id",
  "qualityNotionDb": "database-id",
  "collectionNotionDb": "database-id"
}

# 4. Slack 연동 (선택)
{
  "slackChannel": "#fashion-alerts"
}
```

## Usage Examples

### 1. 디자인 조회

```typescript
// fashion-designer agent 사용
"2026SS 컬렉션의 모든 디자인을 조회해주세요"

// 내부적으로 clo3d__getDesigns 호출
{
  collectionId: "2026ss-collection-id",
  season: "2026SS",
  status: "approved"
}
```

### 2. 패턴 추출

```typescript
// fashion-designer agent 사용
"디자인 ID xyz의 패턴을 DXF로 추출해주세요"

// 내부적으로 clo3d__exportPattern 호출
{
  designId: "xyz",
  format: "dxf",
  includeSeamAllowance: true
}
```

### 3. 3D 렌더링

```typescript
// fashion-designer agent 사용
"디자인 ID xyz의 고품질 렌더링을 생성해주세요"

// 내부적으로 clo3d__render3D 호출
{
  designId: "xyz",
  quality: "high",
  angle: 45
}
```

### 4. 컬렉션 생산 워크플로우

```typescript
// collection-production workflow 실행
"2026SS 컬렉션의 생산 프로세스를 시작해주세요"

// 워크플로우 실행:
// 1. 디자인 승인 확인 (fashion-designer)
// 2. 자재 소요 계산 (production-manager)
// 3. 생산 일정 수립 (production-manager)
// 4. 샘플 제작 및 검수 (quality-inspector)
// 5. 생산 진행
```

## Permissions

This extension requires:
- `read:notion` - Notion 데이터베이스 읽기
- `write:notion` - Notion 데이터베이스 쓰기
- `read:drive` - Google Drive 파일 읽기
- `write:drive` - Google Drive 파일 쓰기
- `send:slack` - Slack 메시지 전송
- `execute:workflows` - 워크플로우 실행
- `manage:agents` - Agent 관리

## Development

### File Structure

All TypeScript files follow consistent patterns:
- Hooks: ExtensionContext parameter
- MCP Tools: MCPConnection, validation, error handling
- Index: Extension metadata and registration

### Type Safety

All files pass TypeScript LSP diagnostics with no errors.

### Testing

```bash
# Run extension tests
npm test extensions/kyndof-fashion

# Test individual components
npm test extensions/kyndof-fashion/mcp/clo3d
npm test extensions/kyndof-fashion/hooks
```

## Version History

### 1.0.0 (2026-01-30)
- Initial release
- 4 specialized agents
- 5 domain skills
- 3 CLO3D MCP tools
- 3 production workflows
- Complete lifecycle hooks

## Support

For issues or questions:
- Email: dev@kyndof.com
- Documentation: https://kyndof.com/docs/nubabel-extension
- GitHub: https://github.com/kyndof/nubabel-fashion-extension

## License

Proprietary - Kyndof Corp © 2026
