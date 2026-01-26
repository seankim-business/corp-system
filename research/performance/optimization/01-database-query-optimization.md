# Database Query Optimization for Prisma + PostgreSQL (Multi-Tenant RLS)

> **Purpose**: Prisma + Postgres(RLS 멀티테넌시)에서 성능을 안정적으로 내기 위한 실전 체크리스트

---

## Table of Contents

1. [RLS performance rules](#rls-performance-rules)
2. [Indexing for multi-tenant](#indexing-for-multi-tenant)
3. [Prisma query patterns](#prisma-query-patterns)
4. [Pagination](#pagination)
5. [EXPLAIN ANALYZE workflow](#explain-analyze-workflow)
6. [pg_stat_statements](#pg_stat_statements)
7. [Connection pooling](#connection-pooling)
8. [Checklists](#checklists)
9. [References](#references)

---

## RLS performance rules

RLS policy는 “모든 row”에 대해 평가될 수 있으므로, 잘못 작성하면 급격히 느려질 수 있습니다.

### Rule 1) Row 값을 함수 인자로 넘기지 말 것

```sql
-- BAD: row마다 함수 호출 가능
CREATE POLICY bad_policy ON items FOR SELECT
  USING (check_access(item_id, user_id));

-- GOOD: session context 기반
CREATE POLICY good_policy ON items FOR SELECT
  USING (tenant_id = current_tenant_id());
```

### Rule 2) RLS 함수는 STABLE

```sql
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
  SELECT current_setting('app.tenant_id')::uuid;
$$ LANGUAGE sql STABLE;
```

### Rule 3) `(SELECT fn())`로 감싸 initPlan 캐시 유도

```sql
-- GOOD: fn() 결과를 쿼리당 1회로 캐시하는 최적화에 유리
CREATE POLICY p ON table FOR SELECT
  USING ((SELECT auth.uid()) = user_id);
```

### Rule 4) Chained RLS가 필요한 조인은 SECURITY DEFINER 함수로 우회

```sql
CREATE OR REPLACE FUNCTION user_team_ids() RETURNS int[] AS $$
  SELECT array(
    SELECT team_id FROM team_user WHERE user_id = (SELECT auth.uid())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY p_team ON items FOR SELECT
  USING (team_id = ANY(ARRAY(SELECT user_team_ids())));
```

---

## Indexing for multi-tenant

### Left-prefix rule

멀티테넌트에서는 `tenant_id`를 **복합 인덱스의 첫 컬럼**으로 두는 것이 기본입니다.

```sql
CREATE INDEX idx_events_tenant_status_created
  ON events (tenant_id, status, created_at DESC);
```

Prisma:

```prisma
model Event {
  id        String   @id @default(cuid())
  tenantId  String
  status    String
  createdAt DateTime @default(now())

  @@index([tenantId])
  @@index([tenantId, status, createdAt(sort: Desc)])
}
```

---

## Prisma query patterns

### N+1 회피

```ts
// GOOD: include로 배치
const users = await prisma.user.findMany({
  include: { posts: true },
});
```

### 필요한 컬럼만 select

```ts
const users = await prisma.user.findMany({
  select: { id: true, email: true, name: true },
});
```

---

## Pagination

대규모 데이터셋은 offset pagination이 느려집니다. cursor/keyset을 권장합니다.

```ts
const page = await prisma.item.findMany({
  where: { tenantId },
  take: 20,
  cursor: lastId ? { id: lastId } : undefined,
  skip: lastId ? 1 : 0,
  orderBy: { id: "asc" },
});
```

---

## EXPLAIN ANALYZE workflow

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM items WHERE tenant_id = '...'
ORDER BY created_at DESC
LIMIT 50;
```

체크 포인트:

- `Seq Scan` 여부
- estimated rows vs actual rows 차이(통계/인덱스)
- `Rows Removed by Filter` 급증
- disk sort 발생

---

## pg_stat_statements

가장 비용 큰 쿼리/가장 잦은 쿼리를 파악해 최적화 우선순위를 잡습니다.

```sql
SELECT
  substring(query, 1, 120) AS query_preview,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

---

## Connection pooling

Prisma는 PgBouncer를 transaction mode로 붙이는 구성이 흔합니다.

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

---

## Checklists

### RLS

- [ ] RLS 함수 STABLE
- [ ] `(SELECT fn())`로 감싸 캐시
- [ ] row data를 함수 인자로 넘기지 않음
- [ ] policy 컬럼 인덱스 존재

### Prisma

- [ ] N+1 제거(include / join strategy)
- [ ] select 최소화
- [ ] cursor pagination

---

## References

- PostgreSQL: EXPLAIN — https://www.postgresql.org/docs/current/using-explain.html
- Prisma: PgBouncer — https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer
- Supabase: RLS performance guide — https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv

---

**Document Version**: 1.0  
**Last Updated**: January 26, 2026
