---
active: true
iteration: 1
max_iterations: 100
completion_promise: "DONE"
started_at: "2026-01-28T07:00:22.501Z"
session_id: "ses_3fc98c6b2ffeBhLUM3gnkzieTY"
---
SOP YAML 스키마 및 실행 엔진 강화**
You are working on the Nubabel project at /Users/sean/Documents/Kyndof/tools/nubabel
TASK: Enhance SOP Definition and Execution Engine
Background
Current SOP is stored as JSON in Workflow.sopSteps.
Planning docs (plan/08-sop-automation/sop-format.md) specify YAML-based external SOPs.
Deliverables
1. Create config/sops/ directory with example SOPs:
   - customer-onboarding.yaml
   - employee-onboarding.yaml
   - campaign-brief.yaml
   - contract-review.yaml
   - incident-response.yaml
2. Define SOP YAML schema:
      schema_version: "1.0"
   kind: SOP
   metadata:
     id: customer-onboarding
     name: 신규 고객 온보딩
     function: cs
     owner: cs-team-lead
     version: 1.2.0
   
   triggers:
     - pattern: "신규 고객 온보딩"
     - pattern: "고객 온보딩 시작"
   
   steps:
     - id: welcome-email
       name: 환영 이메일 발송
       type: automated
       agent: cs-agent
       tool: send_email
       input:
         template: welcome-email
         to: "{{customer.email}}"
       
     - id: kickoff-meeting
       name: 킥오프 미팅 예약
       type: manual
       requires_approval: false
       
     - id: account-setup
       name: 계정 설정
       type: approval_required
       approver: cs-team-lead
       timeout: 24h
   
   exception_handling:
     - condition: "step.failed"
       action: notify_owner
   
3. Update src/services/sop-executor.ts:
   - Load SOPs from YAML files
   - Execute steps based on type (automated/manual/approval)
   - Handle exception conditions
4. Create src/config/sop-loader.ts:
   - Validate SOP YAML schema
   - Export SOPDefinition type
Reference Files
- plan/08-sop-automation/sop-format.md
- src/services/sop-executor.ts (current implementation)
- src/api/sop.ts
Success Criteria
- [ ] 5 example SOP YAML files
- [ ] SOP loader with validation
- [ ] sop-executor.ts uses YAML definitions
- [ ] Exception handling working
