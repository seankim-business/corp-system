# Nubabel Development Rules

## CRITICAL: Dual-Interface Design Rule

**모든 기능을 만들 때 반드시 고려해야 할 사항:**

1. **Agent 사용**: Slack 에이전트(@Nubabel)가 해당 기능을 사용할 수 있어야 함
2. **WebUI 사용**: app.nubabel.com 에서 사용자가 직접 사용할 수 있어야 함

### 체크리스트
- [ ] API 엔드포인트가 agent와 webUI 모두에서 접근 가능한가?
- [ ] 권한 체크가 양쪽 인터페이스에서 일관성 있게 적용되는가?
- [ ] 에러 메시지가 agent(텍스트)와 webUI(UI) 모두에 적합한가?
- [ ] 기능이 Slack 대화 컨텍스트에서도 자연스럽게 동작하는가?

## QA/QC Testing Protocol

### Testing Channels
1. **WebUI**: Claude in Chrome으로 app.nubabel.com 직접 테스트
2. **Slack Agent**: #it-test 채널에서 @Nubabel 멘션으로 테스트
3. **Build Monitoring**: Railway CLI로 배포 상태 감시

### Testing Workflow
1. 기능 개발 완료
2. Railway 배포 확인
3. WebUI 테스트 (Chrome)
4. Slack Agent 테스트 (#it-test)
5. 문제 발견 시 즉시 수정
6. 모든 기능 통과할 때까지 반복
