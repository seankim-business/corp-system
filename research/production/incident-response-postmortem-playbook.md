# Incident Response and Post-Mortem Playbook

## Executive Summary

This playbook provides a comprehensive framework for handling production incidents from detection through resolution and learning. Based on industry best practices from Google SRE, PagerDuty, Incident.io, and real-world post-mortems from AWS and GitHub.

**Key Sources:**

- [Google SRE Incident Management Guide](https://sre.google/resources/practices-and-processes/incident-management-guide/)
- [Google SRE Book - Managing Incidents](https://sre.google/sre-book/managing-incidents/)
- [PagerDuty Incident Response Documentation](https://response.pagerduty.com/)
- [AWS DynamoDB Outage Post-Mortem (Oct 2025)](https://aws.amazon.com/message/101925/)

---

## 1) Incident lifecycle

1. Detect
2. Triage
3. Mitigate
4. Resolve
5. Postmortem & follow-ups

---

## 2) Roles

- **Incident Commander (IC)**: 의사결정/우선순위
- **Comms**: 내부/외부 커뮤니케이션
- **Ops/Eng**: 실제 대응

---

## 3) Severity levels (example)

- SEV1: 전체 장애/데이터 손실 위험
- SEV2: 주요 기능 장애(대다수 고객 영향)
- SEV3: 부분 장애/우회 가능

---

## 4) First 15 minutes checklist

- [ ] IC 지정
- [ ] 현재 영향 범위 파악(tenant 수, 기능)
- [ ] 롤백/feature flag 가능 여부
- [ ] 상태 페이지/Slack 공지 초안
- [ ] 타임라인 기록 시작

---

## 5) Communication templates

### Internal (Slack)

```
SEV2 Incident: [title]

Impact: [who/what]
Start: [time]
Owner: @ic

Next update: in 15m
```

### External (status page)

- What happened (high-level)
- Current status
- Next update time

---

## 6) Technical response patterns

- “Stop the bleeding” 먼저: rate limit, disable feature, rollback
- 변경은 최소화하고, 관측(로그/메트릭/트레이스)을 확보
- 데이터 위험이 있으면 write 차단

---

## 7) Postmortem template

### Required sections

- Summary
- Impact
- Root cause
- Detection
- Timeline
- What went well / poorly
- Action items (owner + due date)

---

## References

- Google SRE Incident Management Guide — https://sre.google/resources/practices-and-processes/incident-management-guide/
- Google SRE Book: Managing Incidents — https://sre.google/sre-book/managing-incidents/
- PagerDuty Incident Response — https://response.pagerduty.com/

---

**Document Version**: 1.0  
**Last Updated**: January 26, 2026  
**Next Review**: April 26, 2026
