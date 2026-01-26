# Database Sharding and Partitioning Strategies: Complete Guide

## Executive Summary

This guide provides a comprehensive evaluation of database scaling strategies for PostgreSQL, covering when to shard, how to implement partitioning, and migration paths from single-instance to distributed databases.

**Key Findings:**

- **Partitioning** (single database) is suitable for tables >100GB with time-series or categorical data
- **Sharding** (multiple databases) becomes necessary at >1TB or when single-node performance limits are reached
- **Citus** offers the most mature PostgreSQL sharding solution with both row-based and schema-based models
- **Instagram's case study** demonstrates successful PostgreSQL sharding to 500M+ users

---

## 1) Partitioning (Single DB)

PostgreSQL 파티셔닝은 “단일 DB에서 테이블을 분할”해 관리/성능을 개선합니다.

### 언제 쓰나

- time-series 테이블이 커짐(예: 이벤트/로그)
- tenant_id 또는 날짜 기반으로 자연스러운 분리가 가능

### 주요 방식

- RANGE (시간 범위)
- LIST (카테고리)
- HASH (균등 분산)

### 예시: RANGE partition (월 단위)

```sql
CREATE TABLE events (
  id bigserial primary key,
  tenant_id uuid not null,
  created_at timestamptz not null,
  payload jsonb not null
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2026_01 PARTITION OF events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

파티션별 인덱스 전략이 필요합니다(tenant_id, created_at 조합).

---

## 2) Sharding (Multiple DBs)

샤딩은 “여러 DB로 데이터를 분산”합니다.

### 언제 고려하나

- 단일 DB로 성능/스토리지 한계
- tenant isolation을 물리적으로 강제해야 함

### Postgres에서 옵션

- Citus (distributed Postgres)
- schema-per-tenant / db-per-tenant 전략

---

## 3) Multi-tenant 전략 비교

| 전략              | 장점             | 단점            | 추천 시점         |
| ----------------- | ---------------- | --------------- | ----------------- |
| RLS (single DB)   | 단순, 운영 쉬움  | noisy neighbor  | 초기/중기         |
| Schema-per-tenant | tenant 분리 강화 | migrations 복잡 | tenant 수 적을 때 |
| DB-per-tenant     | 격리 최강        | 운영 복잡/비용  | 엔터프라이즈      |
| Citus             | 분산 + SQL 유지  | 운영/학습 비용  | 대규모            |

---

## 4) Migration playbook (high-level)

1. 파티셔닝으로 먼저 수평 확장
2. hot table/tenant 식별
3. 특정 tenant를 별도 DB로 분리(필요 시)
4. 점진적으로 shard 확대

---

## 5) Operational checklist

- [ ] 테넌트별 사용량/성능 모니터링
- [ ] 인덱스 전략(tenant_id left-prefix)
- [ ] 백업/복구 전략(샤드 단위)
- [ ] migrations 절차(Expand/Contract)

---

## References

- PostgreSQL partitioning — https://www.postgresql.org/docs/current/ddl-partitioning.html
- Citus docs — https://docs.citusdata.com/

---

**Document Version:** 1.0  
**Last Updated:** January 26, 2026  
**Research Sources:** PostgreSQL docs, Citus documentation, Instagram engineering blog
