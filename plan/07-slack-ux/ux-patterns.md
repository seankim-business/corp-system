# Slack UX 패턴

## 멘션 규칙

### 기본 멘션

```yaml
mention_patterns:
  # App 멘션 (Orchestrator로 라우팅)
  app_mention:
    pattern: "@company-os"
    example: "@company-os 캠페인 브리프 작성해줘"
    routing: "orchestrator"

  # 커스텀 에이전트 멘션
  agent_mention:
    pattern: "@{agent-name}[-agent]"
    examples:
      - "@brand-agent"
      - "@brand"
      - "@finance-agent"
      - "@finance"
    routing: "direct to agent"

  # 복합 멘션
  multi_mention:
    pattern: "@{agent1} @{agent2}"
    example: "@brand @finance 캠페인 예산 포함해서 브리프 작성해줘"
    routing: "parallel or sequential based on context"
```

### 멘션 처리 로직

```
1. 메시지 수신

2. 멘션 파싱
   ├─ @company-os → Orchestrator
   ├─ @{agent} → 해당 에이전트
   └─ 멘션 없음 → 채널 기본 에이전트

3. 라우팅 결정
   ├─ 단일 에이전트 → 직접 호출
   └─ 복수 에이전트 → Orchestrator 조정

4. 응답 생성
   └─ 에이전트 페르소나로 응답
```

---

## 메시지 포맷 가이드

### 에이전트 응답 형식

```
{emoji} *[{Agent Name}]*
{message content}
```

**예시:**

```
:art: *[Brand]*
캠페인 브리프를 작성했습니다.

**캠페인 개요**
- 제목: 2025 S/S 컬렉션 론칭
- 기간: 2025-02-15 ~ 2025-03-15
- 예산: 1,000만원

[브리프 전체 보기](https://notion.so/...)
```

### 상태 표시

| 상태 | 표시 | 설명 |
|------|------|------|
| 작업 중 | ⏳ | 에이전트가 작업 처리 중 |
| 완료 | ✅ | 작업 성공적 완료 |
| 실패 | ❌ | 작업 실패 |
| 대기 중 | ⏸️ | 승인/입력 대기 |
| 경고 | ⚠️ | 주의 필요 |

### 진행 상황 표시

```
:art: *[Brand]* ⏳
캠페인 브리프 작성 중...

━━━━━━━━░░ 80%
• ✓ 정보 수집 완료
• ✓ 예산 확인 완료
• → 브리프 작성 중
• ○ 승인 요청 예정
```

---

## 상호작용 패턴

### 승인 요청

```yaml
approval_pattern:
  trigger: "SOP에 승인 포인트 정의됨"

  message:
    format: |
      {emoji} *[{agent_name}]* 🔔 *승인 요청*

      **{approval_title}**
      {description}

      • 요청자: {requester}
      • 승인자: <@{approver_id}>
      • 기한: {timeout}

    blocks:
      - type: "section"
        text: "{description}"
      - type: "actions"
        elements:
          - type: "button"
            text: "✅ 승인"
            style: "primary"
            action_id: "approve_{request_id}"
          - type: "button"
            text: "❌ 거절"
            style: "danger"
            action_id: "reject_{request_id}"
          - type: "button"
            text: "📝 피드백과 함께 거절"
            action_id: "reject_with_feedback_{request_id}"

  on_approve:
    update_message: |
      {emoji} *[{agent_name}]* ✅ *승인 완료*
      승인자: <@{approver_id}>
      승인 시간: {timestamp}

  on_reject:
    update_message: |
      {emoji} *[{agent_name}]* ❌ *거절됨*
      거절자: <@{approver_id}>
      사유: {reason}
```

### 선택지 제공

```yaml
choice_pattern:
  trigger: "에이전트가 사용자 선택 필요"

  message:
    format: |
      {emoji} *[{agent_name}]*

      {question}

    blocks:
      - type: "section"
        text: "{question}"
      - type: "actions"
        elements:
          - type: "button"
            text: "{option_1}"
            action_id: "choice_1"
          - type: "button"
            text: "{option_2}"
            action_id: "choice_2"
          - type: "button"
            text: "{option_3}"
            action_id: "choice_3"

  example:
    question: "어떤 유형의 캠페인 브리프를 작성할까요?"
    options:
      - "🚀 일반 캠페인"
      - "⚡ 긴급 캠페인 (간소화)"
      - "🎯 프로모션 캠페인"
```

### 위임 알림

```yaml
delegation_pattern:
  trigger: "에이전트가 다른 에이전트에게 위임"

  message:
    format: |
      {from_emoji} *[{from_agent}]* → {to_emoji} *[{to_agent}]*
      *위임: {task_description}*

  example: |
    :art: *[Brand]* → :chart: *[Finance]*
    *위임: 캠페인 예산 확인*

    예상 예산: 1,000만원
    부서: 브랜드팀
```

### 에러/경고

```yaml
error_pattern:
  format: |
    {emoji} *[{agent_name}]* ⚠️

    **문제 발생**
    {error_description}

    **권장 조치**
    {recommendation}

  example: |
    :art: *[Brand]* ⚠️

    **문제 발생**
    브랜드 가이드라인 문서를 찾을 수 없습니다.

    **권장 조치**
    • GitHub의 `/docs/brand/guidelines.md` 확인
    • 관리자에게 문의: @jane
```

---

## 채널/스레드 UX

### 스레드 시작

```yaml
thread_start:
  trigger: "복잡한 작업 시작"

  main_message:
    format: |
      🚀 *{task_title} 시작*

      • 요청자: <@{user_id}>
      • 담당: {agent_name}
      • 예상 시간: {estimated_time}

      _진행 상황은 이 스레드에서 확인하세요_

  auto_replies:
    - "진행 상황 업데이트"
    - "에이전트 간 협업 내용"
    - "승인 요청"
    - "최종 결과"
```

### 스레드 완료

```yaml
thread_complete:
  main_message_update:
    append: |
      ✅ *완료* ({duration})

  final_reply:
    format: |
      {emoji} *[{agent_name}]* ✅ *작업 완료*

      **결과 요약**
      {summary}

      **산출물**
      {outputs}

      **다음 단계**
      {next_steps}
```

### 채널 컨텍스트

```yaml
channel_context:
  # 채널에 입장 시 컨텍스트 인식
  on_channel_enter:
    detect:
      - channel_type (func/vs/obj)
      - channel_name
      - recent_conversation

    set_default_agent:
      "#func-brand-*": "agent-brand"
      "#func-finance-*": "agent-finance"
      "#vs-*": "해당 VS의 owner agent"
      "#obj-*": "해당 Objective의 owner agent"

  # 채널 설명에 현재 상태 표시
  channel_topic:
    format: |
      {type_emoji} {channel_purpose}
      담당: {default_agent} | 상태: {current_status}
```

---

## 인터랙티브 요소

### Home Tab

```yaml
home_tab:
  sections:
    - header: "📊 현재 진행 중"
      content: "활성 Objective 목록"

    - header: "🔔 대기 중인 승인"
      content: "사용자의 승인 요청 목록"

    - header: "📝 최근 활동"
      content: "에이전트 활동 로그"

    - header: "🤖 에이전트 목록"
      content: "사용 가능한 에이전트와 설명"

    - header: "📚 자주 묻는 질문"
      content: "바로가기 버튼"
```

### 모달 (승인 상세)

```yaml
modal:
  approval_detail:
    title: "승인 요청 상세"

    blocks:
      - type: "section"
        label: "요청 내용"
        content: "{description}"

      - type: "section"
        label: "관련 문서"
        content: "{document_links}"

      - type: "input"
        label: "코멘트 (선택)"
        placeholder: "승인/거절 사유를 입력하세요"

      - type: "actions"
        elements:
          - "승인"
          - "거절"
          - "취소"
```

---

## 반응형 UX

### 로딩 상태

```yaml
loading_states:
  # 즉시 반응 (< 1초)
  instant:
    action: "이모지 리액션 추가 (👀)"

  # 짧은 작업 (1-5초)
  short:
    action: "⏳ 작업 중... 메시지"

  # 긴 작업 (> 5초)
  long:
    action: |
      1. 작업 시작 메시지
      2. 주기적 진행 상황 업데이트
      3. 완료 시 최종 메시지

  # 매우 긴 작업 (> 1분)
  very_long:
    action: |
      1. 스레드 생성
      2. "작업을 백그라운드에서 처리합니다"
      3. 완료 시 멘션과 함께 알림
```

### 에러 복구

```yaml
error_recovery:
  # 재시도 가능
  retryable:
    message: |
      ⚠️ 일시적 오류가 발생했습니다.

    actions:
      - type: "button"
        text: "🔄 다시 시도"
        action_id: "retry"

  # 재시도 불가
  non_retryable:
    message: |
      ❌ 요청을 처리할 수 없습니다.

      {error_details}

      문제가 계속되면 @admin에게 문의해주세요.
```
