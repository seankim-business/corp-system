# Auto-Scaling Implementation Guide for SaaS Applications

## Executive Summary

This guide provides a comprehensive framework for implementing auto-scaling in SaaS applications, covering horizontal and vertical scaling strategies, platform-specific configurations (Railway, Kubernetes, AWS), database connection management, and cost optimization patterns.

---

## 1) What to scale (components)

- **API web**: request 처리(Express)
- **Workers**: BullMQ worker (장시간 작업/AI calls)
- **DB**: connection pool / replicas
- **Redis**: memory/throughput

각 컴포넌트는 스케일 신호가 다릅니다.

---

## 2) Scaling signals (golden)

### Web/API

- p95 latency
- error rate
- CPU/memory
- in-flight requests

### Queue/Workers

- queue depth (waiting)
- active jobs
- job duration(p95)
- retry/dead-letter 증가

---

## 3) Horizontal vs Vertical

- **Horizontal**: 인스턴스 수 증가(대부분의 PaaS에서 기본)
- **Vertical**: instance size 증가(메모리/CPU 늘리기)

권장:

- Web은 horizontal 우선
- Worker는 queue depth 기반 horizontal

---

## 4) Queue-length 기반 worker autoscaling (핵심)

1. BullMQ queue metrics 수집
2. waiting jobs가 임계치 초과 시 worker 수 증가
3. backlog가 비면 scale-in

주의:

- DB connection 수가 병목이면 workers만 늘려도 효과 없음
- AI API rate limit이 병목이면 scale-out이 비용만 증가

---

## 5) Database connection management

Autoscaling에서 가장 흔한 장애는 “인스턴스 증가 → DB connection 폭발”입니다.

- per-instance connection limit 설정
- PgBouncer 등 pooler 사용
- Prisma는 directUrl 분리(마이그레이션)

---

## 6) Platform notes

### Railway-like PaaS

- CPU/mem 기반 autoscaling을 제공하는 경우가 많음
- idle timeout / cold start 고려
- health checks/readiness 중요

### Kubernetes (옵션)

- HPA로 CPU/mem 또는 custom metric(queue depth) 기반 scaling

---

## 7) Guardrails

- max instances cap
- per-tenant rate limit
- cost budget (AI calls)
- circuit breaker

---

## References

- Kubernetes HPA — https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
- AWS Auto Scaling — https://docs.aws.amazon.com/autoscaling/

---

**Document Version**: 1.0  
**Last Updated**: January 26, 2026  
**Research Sources**: Kubernetes docs, Railway docs, AWS documentation, BullMQ, Judoscale
