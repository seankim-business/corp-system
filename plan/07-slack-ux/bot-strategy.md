# Slack 봇 전략

## 옵션 비교

### A. 봇 여러 개 전략

각 에이전트를 별도 Slack App/봇으로 만듦.

```
Slack Workspace
├── @company-os (Orchestrator)
├── @brand-agent
├── @product-agent
├── @finance-agent
├── @hr-agent
└── @ops-agent
```

| 장점 | 단점 |
|------|------|
| 명확한 에이전트 구분 | 앱 관리 복잡 |
| 개별 권한 설정 가능 | 설치/승인 여러 번 |
| 네이티브 @멘션 | 비용 증가 가능 |
| 프로필 사진 개별 설정 | 개발/유지보수 부담 |

### B. 봇 하나 + 멀티 페르소나 전략

하나의 Slack App이 여러 에이전트 "페르소나"를 표현.

```
Slack Workspace
└── @company-os (Single App)
     ├── [Brand] 페르소나
     ├── [Product] 페르소나
     ├── [Finance] 페르소나
     └── ...
```

| 장점 | 단점 |
|------|------|
| 앱 관리 단순 | 네이티브 @멘션 불가 |
| 권한 통합 관리 | 페르소나 구분 덜 직관적 |
| 비용 최적화 | 프로필 사진 공유 |
| 배포/업데이트 간편 | 커스텀 멘션 파싱 필요 |

---

## 선택: B. 봇 하나 + 멀티 페르소나

### 선택 이유

1. **운영 단순화**: 엔지니어 리소스가 적음
2. **권한 관리 용이**: 단일 앱에서 모든 권한 관리
3. **비용 효율**: Slack 앱 하나만 운영
4. **일관된 UX**: 통합된 사용자 경험

### 페르소나 구분 방법

```yaml
persona_identification:
  # 메시지 접두사
  prefix:
    format: "[{Agent Name}]"
    examples:
      - "[Brand]"
      - "[Finance]"
      - "[System]"

  # 이모지 사용
  emoji:
    brand: ":art:"
    finance: ":chart_with_upwards_trend:"
    hr: ":busts_in_silhouette:"
    product: ":package:"
    ops: ":gear:"
    system: ":robot_face:"

  # 메시지 포맷
  message_format: |
    {emoji} *[{agent_name}]*
    {message_content}
```

---

## 앱 설정

### Slack App 구성

```yaml
app:
  name: "Kyndof Company OS"
  display_name: "Company OS"

  bot_user:
    display_name: "Company OS"
    always_online: true

  oauth_scopes:
    bot:
      - "app_mentions:read"
      - "channels:history"
      - "channels:read"
      - "chat:write"
      - "commands"
      - "files:read"
      - "groups:history"
      - "groups:read"
      - "im:history"
      - "im:read"
      - "im:write"
      - "reactions:read"
      - "reactions:write"
      - "users:read"
      - "users:read.email"

  features:
    app_home:
      enabled: true
      messages_tab: true
    slash_commands:
      - command: "/ask"
        description: "Company OS에 질문"
      - command: "/sop"
        description: "SOP 검색"
      - command: "/status"
        description: "진행 중인 Objective 상태"

  event_subscriptions:
    - "app_mention"
    - "message.channels"
    - "message.groups"
    - "message.im"
```

### 커스텀 멘션 처리

```yaml
custom_mentions:
  pattern: "@{agent-name}"

  mappings:
    "@brand-agent": "agent-brand"
    "@brand": "agent-brand"
    "@finance-agent": "agent-finance"
    "@finance": "agent-finance"
    "@hr-agent": "agent-hr"
    "@hr": "agent-hr"
    "@product-agent": "agent-product"
    "@product": "agent-product"
    "@ops-agent": "agent-ops"
    "@ops": "agent-ops"

  handling:
    1. 메시지에서 커스텀 멘션 패턴 감지
    2. 해당 에이전트로 라우팅
    3. 응답 시 해당 페르소나로 표시
```

---

## 메시지 포맷

### 에이전트 응답 형식

```yaml
response_formats:
  # 기본 응답
  default:
    format: |
      {emoji} *[{agent_name}]*
      {message}

    example: |
      :art: *[Brand]*
      캠페인 브리프 초안을 작성했습니다.
      [브리프 보기](https://notion.so/...)

  # 작업 진행 중
  in_progress:
    format: |
      {emoji} *[{agent_name}]* ⏳
      {task_description}...

  # 승인 요청
  approval_request:
    format: |
      {emoji} *[{agent_name}]* 🔔
      *승인 요청*
      {description}

      승인자: <@{approver_slack_id}>
      기한: {timeout}

    blocks:
      - type: "actions"
        elements:
          - type: "button"
            text: "✅ 승인"
            style: "primary"
            action_id: "approve"
          - type: "button"
            text: "❌ 거절"
            style: "danger"
            action_id: "reject"

  # 위임 알림
  delegation:
    format: |
      {emoji} *[{agent_name}]*
      → {target_emoji} *[{target_agent}]* 에게 위임

      작업: {task_description}
```

### Block Kit 템플릿

```yaml
block_templates:
  # SOP 실행 결과
  sop_result:
    blocks:
      - type: "header"
        text: "{sop_title} 완료"
      - type: "section"
        fields:
          - type: "mrkdwn"
            text: "*담당*\n{agent_name}"
          - type: "mrkdwn"
            text: "*소요 시간*\n{duration}"
      - type: "section"
        text: "*결과*\n{result_summary}"
      - type: "actions"
        elements:
          - type: "button"
            text: "상세 보기"
            url: "{detail_url}"

  # Objective 상태
  objective_status:
    blocks:
      - type: "header"
        text: "📋 {objective_title}"
      - type: "section"
        fields:
          - type: "mrkdwn"
            text: "*상태*\n{status_emoji} {status}"
          - type: "mrkdwn"
            text: "*현재 단계*\n{current_stage}"
          - type: "mrkdwn"
            text: "*담당*\n{owner_agent}"
          - type: "mrkdwn"
            text: "*기한*\n{due_date}"
      - type: "divider"
      - type: "section"
        text: "*Key Results*"
      # KR 목록...
```

---

## 채널/스레드 구조

### 채널 유형

```yaml
channel_types:
  # Function 채널
  function_channels:
    naming: "#func-{function-name}"
    examples:
      - "#func-brand-creative"
      - "#func-product"
      - "#func-finance"
    purpose: "Function 관련 논의 및 에이전트 호출"
    default_agent: "해당 Function의 에이전트"

  # Value Stream 채널
  value_stream_channels:
    naming: "#vs-{value-stream-name}"
    examples:
      - "#vs-collection-launch"
      - "#vs-customer-support"
    purpose: "Value Stream 관련 크로스팀 협업"
    default_agent: "Value Stream Owner 에이전트"

  # Objective 채널
  objective_channels:
    naming: "#obj-{year}-{project-slug}"
    examples:
      - "#obj-2025-ss-launch"
      - "#obj-2025-q1-campaign"
    purpose: "특정 Objective/프로젝트 전용"
    lifecycle: "Objective 완료 시 아카이브"
    default_agent: "Objective Owner 에이전트"

  # 일반 채널
  general_channels:
    - "#general"
    - "#random"
    default_agent: "Orchestrator"
```

### 스레드 활용

```yaml
thread_strategy:
  # 복잡한 작업은 스레드로
  use_thread_when:
    - "멀티 에이전트 협업"
    - "긴 대화/작업"
    - "승인 플로우"
    - "Objective 업데이트"

  thread_structure:
    main_message: "작업 시작 알림"
    replies:
      - "진행 상황 업데이트"
      - "에이전트 간 대화"
      - "승인 요청/결과"
      - "최종 결과"

  example:
    main: |
      🚀 *캠페인 브리프 작성 시작*
      요청자: @user
      담당: [Brand]

    reply_1: |
      :art: *[Brand]*
      정보 수집 중...

    reply_2: |
      :art: *[Brand]* → :chart: *[Finance]*
      예산 확인 요청

    reply_3: |
      :chart: *[Finance]*
      예산 확인 완료. 가용 예산: 1,000만원

    reply_4: |
      :art: *[Brand]*
      브리프 초안 완료. 승인 요청 중...

    reply_5: |
      :art: *[Brand]* ✅
      브리프 승인 완료!
      [브리프 보기](...)
```

---

## 호출 방법

### @멘션 (App)

```
@company-os 캠페인 브리프 작성해줘
```
→ Orchestrator가 받아서 적절한 에이전트로 라우팅

### 커스텀 @멘션

```
@brand-agent 브랜드 가이드라인 확인해줘
```
→ 직접 Brand Agent로 라우팅

### Slash 명령어

```
/ask 휴가 정책이 뭐야?
/sop 온보딩
/status 2025 S/S 론칭
```

### DM

```
Company OS 앱에 DM
→ Orchestrator와 1:1 대화
```

---

## 권한 및 보안

```yaml
access_control:
  # 채널별 에이전트 접근
  channel_permissions:
    "#func-brand-creative":
      default_agent: "agent-brand"
      allowed_agents: ["agent-brand", "agent-product"]

    "#func-finance":
      default_agent: "agent-finance"
      allowed_agents: ["agent-finance"]
      restricted: true  # 승인된 사용자만

  # 민감 정보 필터링
  sensitive_data:
    mask_in_public: true
    allowed_channels:
      salary_info: ["#func-hr-private"]
      financial_details: ["#func-finance"]

  # 감사 로깅
  audit_log:
    enabled: true
    log_contents:
      - channel_id
      - user_id
      - agent_id
      - action
      - timestamp
```
