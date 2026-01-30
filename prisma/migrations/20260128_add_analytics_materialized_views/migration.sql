-- Analytics Materialized Views for Nubabel Platform
-- Created: 2026-01-28
-- Purpose: Pre-aggregated analytics for orchestration, category routing, skill usage, and queue performance
--
-- IMPORTANT: Materialized views require periodic refresh. See refresh_all_materialized_views() at the bottom.
-- Recommended schedule:
--   mv_daily_orchestration_stats  -> every 1 hour   (via pg_cron or application scheduler)
--   mv_category_performance       -> every 1 hour
--   mv_skill_usage                -> every 30 minutes
--   mv_hourly_queue_stats         -> every 15 minutes

-- ============================================================================
-- 1. DAILY ORCHESTRATION STATISTICS
-- ============================================================================
-- Aggregates orchestrator execution data by day and organization.
-- Sources: orchestrator_executions (primary), sessions (for unique user counts)

DROP MATERIALIZED VIEW IF EXISTS mv_daily_orchestration_stats;

CREATE MATERIALIZED VIEW mv_daily_orchestration_stats AS
SELECT
    date_trunc('day', oe.created_at)::date                        AS date,
    oe.organization_id,

    -- Request counts
    COUNT(*)                                                       AS total_requests,
    COUNT(*) FILTER (WHERE oe.status = 'completed')                AS successful_requests,
    COUNT(*) FILTER (WHERE oe.status = 'failed')                   AS failed_requests,

    -- Duration statistics (oe.duration is stored in ms)
    ROUND(AVG(oe.duration))::int                                   AS avg_duration_ms,
    ROUND(
        percentile_cont(0.95) WITHIN GROUP (ORDER BY oe.duration)
    )::int                                                         AS p95_duration_ms,

    -- Unique users who triggered orchestrations that day
    COUNT(DISTINCT oe.user_id)                                     AS unique_users,

    -- Most frequently used category per day/org
    (
        SELECT sub.category
        FROM orchestrator_executions sub
        WHERE sub.organization_id = oe.organization_id
          AND date_trunc('day', sub.created_at) = date_trunc('day', oe.created_at)
        GROUP BY sub.category
        ORDER BY COUNT(*) DESC
        LIMIT 1
    )                                                              AS most_used_category

FROM orchestrator_executions oe
GROUP BY date_trunc('day', oe.created_at)::date, oe.organization_id
WITH NO DATA;

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_mv_daily_orch_stats_pk
    ON mv_daily_orchestration_stats (date, organization_id);

-- Supporting indexes for dashboard queries
CREATE INDEX idx_mv_daily_orch_stats_org
    ON mv_daily_orchestration_stats (organization_id, date DESC);

COMMENT ON MATERIALIZED VIEW mv_daily_orchestration_stats IS
    'Daily aggregated orchestration statistics per organization. Refresh: every 1 hour. '
    'Use REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_orchestration_stats;';


-- ============================================================================
-- 2. CATEGORY PERFORMANCE
-- ============================================================================
-- Tracks routing performance per category within each organization.
-- Includes a 30-day trend indicator comparing recent vs prior period success rates.

DROP MATERIALIZED VIEW IF EXISTS mv_category_performance;

CREATE MATERIALIZED VIEW mv_category_performance AS
SELECT
    oe.organization_id,
    oe.category,

    -- Volume
    COUNT(*)                                                        AS total_requests,

    -- Success rate as a percentage (0.0 - 100.0)
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE oe.status = 'completed') / NULLIF(COUNT(*), 0),
        2
    )                                                               AS success_rate,

    -- Duration
    ROUND(AVG(oe.duration))::int                                    AS avg_duration_ms,

    -- Average confidence score from metadata (if present)
    ROUND(
        AVG(
            CASE
                WHEN oe.metadata IS NOT NULL
                     AND (oe.metadata->>'confidence') IS NOT NULL
                THEN (oe.metadata->>'confidence')::numeric
                ELSE NULL
            END
        ),
        4
    )                                                               AS avg_confidence,

    -- 30-day trend: positive = improving, negative = declining
    -- Compares success rate of last 15 days vs prior 15 days
    ROUND(
        (
            -- Recent 15 days success rate
            100.0 * COUNT(*) FILTER (
                WHERE oe.status = 'completed'
                  AND oe.created_at >= (NOW() - INTERVAL '15 days')
            ) / NULLIF(
                COUNT(*) FILTER (WHERE oe.created_at >= (NOW() - INTERVAL '15 days')), 0
            )
        ) - (
            -- Prior 15 days success rate
            100.0 * COUNT(*) FILTER (
                WHERE oe.status = 'completed'
                  AND oe.created_at >= (NOW() - INTERVAL '30 days')
                  AND oe.created_at < (NOW() - INTERVAL '15 days')
            ) / NULLIF(
                COUNT(*) FILTER (
                    WHERE oe.created_at >= (NOW() - INTERVAL '30 days')
                      AND oe.created_at < (NOW() - INTERVAL '15 days')
                ), 0
            )
        ),
        2
    )                                                               AS last_30_days_trend

FROM orchestrator_executions oe
GROUP BY oe.organization_id, oe.category
WITH NO DATA;

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_mv_category_perf_pk
    ON mv_category_performance (organization_id, category);

-- Supporting index for filtering by category
CREATE INDEX idx_mv_category_perf_category
    ON mv_category_performance (category);

COMMENT ON MATERIALIZED VIEW mv_category_performance IS
    'Category routing performance metrics per organization. Refresh: every 1 hour. '
    'Use REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_performance;';


-- ============================================================================
-- 3. SKILL USAGE ANALYTICS
-- ============================================================================
-- Tracks usage of individual skills extracted from orchestrator_executions.skills array.
-- The skills column is a VARCHAR(100)[] array; we unnest it for per-skill aggregation.

DROP MATERIALIZED VIEW IF EXISTS mv_skill_usage;

CREATE MATERIALIZED VIEW mv_skill_usage AS
SELECT
    oe.organization_id,
    skill_name,

    -- Usage volume
    COUNT(*)                                                        AS usage_count,

    -- Success rate as a percentage (0.0 - 100.0)
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE oe.status = 'completed') / NULLIF(COUNT(*), 0),
        2
    )                                                               AS success_rate,

    -- Duration
    ROUND(AVG(oe.duration))::int                                    AS avg_duration_ms,

    -- Most recent usage
    MAX(oe.created_at)                                              AS last_used_at

FROM orchestrator_executions oe,
     LATERAL unnest(oe.skills) AS skill_name
GROUP BY oe.organization_id, skill_name
WITH NO DATA;

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_mv_skill_usage_pk
    ON mv_skill_usage (organization_id, skill_name);

-- Supporting indexes
CREATE INDEX idx_mv_skill_usage_count
    ON mv_skill_usage (organization_id, usage_count DESC);

CREATE INDEX idx_mv_skill_usage_last_used
    ON mv_skill_usage (organization_id, last_used_at DESC);

COMMENT ON MATERIALIZED VIEW mv_skill_usage IS
    'Per-skill usage analytics derived from orchestrator execution skill arrays. Refresh: every 30 minutes. '
    'Use REFRESH MATERIALIZED VIEW CONCURRENTLY mv_skill_usage;';


-- ============================================================================
-- 4. HOURLY QUEUE STATISTICS
-- ============================================================================
-- Aggregates work queue and job execution performance by hour, queue name, and organization.
-- Sources: work_queue (enqueued/completed/failed counts), job_executions (wait and process times)

DROP MATERIALIZED VIEW IF EXISTS mv_hourly_queue_stats;

CREATE MATERIALIZED VIEW mv_hourly_queue_stats AS
SELECT
    date_trunc('hour', wq.created_at)                               AS hour_bucket,
    wq.queue_name,
    wq.organization_id,

    -- Job counts from work_queue
    COUNT(*)                                                        AS jobs_enqueued,
    COUNT(*) FILTER (WHERE wq.status = 'completed')                 AS jobs_completed,
    COUNT(*) FILTER (WHERE wq.status IN ('failed', 'dead_letter'))  AS jobs_failed,

    -- Average wait time: time from enqueue (created_at) to first execution start
    ROUND(AVG(
        EXTRACT(EPOCH FROM (je_first.first_started_at - wq.created_at)) * 1000
    ))::int                                                         AS avg_wait_time_ms,

    -- Average processing time from job_executions
    ROUND(AVG(je_agg.avg_exec_duration))::int                      AS avg_process_time_ms

FROM work_queue wq

-- Subquery: earliest execution start per work queue item (for wait time)
LEFT JOIN LATERAL (
    SELECT MIN(je.started_at) AS first_started_at
    FROM job_executions je
    WHERE je.work_queue_id = wq.id
) je_first ON true

-- Subquery: average execution duration per work queue item (for process time)
LEFT JOIN LATERAL (
    SELECT AVG(je.duration_ms) AS avg_exec_duration
    FROM job_executions je
    WHERE je.work_queue_id = wq.id
      AND je.duration_ms IS NOT NULL
) je_agg ON true

GROUP BY date_trunc('hour', wq.created_at), wq.queue_name, wq.organization_id
WITH NO DATA;

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_mv_hourly_queue_stats_pk
    ON mv_hourly_queue_stats (hour_bucket, queue_name, organization_id);

-- Supporting indexes for time-range and queue-specific queries
CREATE INDEX idx_mv_hourly_queue_stats_org_time
    ON mv_hourly_queue_stats (organization_id, hour_bucket DESC);

CREATE INDEX idx_mv_hourly_queue_stats_queue
    ON mv_hourly_queue_stats (queue_name, hour_bucket DESC);

COMMENT ON MATERIALIZED VIEW mv_hourly_queue_stats IS
    'Hourly queue performance metrics by queue name and organization. Refresh: every 15 minutes. '
    'Use REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hourly_queue_stats;';


-- ============================================================================
-- 5. REFRESH ALL MATERIALIZED VIEWS FUNCTION
-- ============================================================================
-- Refreshes all analytics materialized views concurrently.
-- CONCURRENTLY allows reads during refresh but requires a unique index on each view.
--
-- Recommended cron schedule (pg_cron example):
--   SELECT cron.schedule('refresh-analytics-mvs', '*/15 * * * *', $$SELECT refresh_all_materialized_views()$$);
--
-- Or call from application code on a schedule:
--   SELECT refresh_all_materialized_views();
--   SELECT refresh_all_materialized_views(concurrent := false);  -- for initial population

CREATE OR REPLACE FUNCTION refresh_all_materialized_views(concurrent BOOLEAN DEFAULT TRUE)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- NOTE: On the very first refresh after creation (WITH NO DATA),
    -- you MUST call with concurrent := false since there is no data yet
    -- for the unique index to operate on.
    --
    -- Initial population:
    --   SELECT refresh_all_materialized_views(concurrent := false);
    --
    -- Subsequent refreshes (safe for concurrent reads):
    --   SELECT refresh_all_materialized_views();  -- defaults to concurrent = true

    IF concurrent THEN
        RAISE NOTICE 'Refreshing materialized views concurrently...';

        RAISE NOTICE '  -> mv_daily_orchestration_stats';
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_orchestration_stats;

        RAISE NOTICE '  -> mv_category_performance';
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_performance;

        RAISE NOTICE '  -> mv_skill_usage';
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_skill_usage;

        RAISE NOTICE '  -> mv_hourly_queue_stats';
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hourly_queue_stats;
    ELSE
        RAISE NOTICE 'Refreshing materialized views (non-concurrent, full refresh)...';

        RAISE NOTICE '  -> mv_daily_orchestration_stats';
        REFRESH MATERIALIZED VIEW mv_daily_orchestration_stats;

        RAISE NOTICE '  -> mv_category_performance';
        REFRESH MATERIALIZED VIEW mv_category_performance;

        RAISE NOTICE '  -> mv_skill_usage';
        REFRESH MATERIALIZED VIEW mv_skill_usage;

        RAISE NOTICE '  -> mv_hourly_queue_stats';
        REFRESH MATERIALIZED VIEW mv_hourly_queue_stats;
    END IF;

    RAISE NOTICE 'All materialized views refreshed successfully.';
END;
$$;

COMMENT ON FUNCTION refresh_all_materialized_views(BOOLEAN) IS
    'Refreshes all analytics materialized views. Pass concurrent := false for initial population after migration. '
    'Recommended schedule: every 15 minutes via pg_cron or application scheduler.';


-- ============================================================================
-- 6. REFRESH SCHEDULE RECOMMENDATIONS
-- ============================================================================
--
-- Below are pg_cron examples. Uncomment and run manually if pg_cron is available:
--
-- -- Refresh daily stats every hour at minute 5
-- SELECT cron.schedule('refresh-daily-orch-stats', '5 * * * *',
--     $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_orchestration_stats$$);
--
-- -- Refresh category performance every hour at minute 10
-- SELECT cron.schedule('refresh-category-perf', '10 * * * *',
--     $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_performance$$);
--
-- -- Refresh skill usage every 30 minutes
-- SELECT cron.schedule('refresh-skill-usage', '*/30 * * * *',
--     $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_skill_usage$$);
--
-- -- Refresh hourly queue stats every 15 minutes
-- SELECT cron.schedule('refresh-hourly-queue', '*/15 * * * *',
--     $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hourly_queue_stats$$);
--
-- -- Or use the unified function every 15 minutes
-- SELECT cron.schedule('refresh-all-analytics', '*/15 * * * *',
--     $$SELECT refresh_all_materialized_views()$$);
--
-- IMPORTANT: After running this migration, perform the initial data population:
--   SELECT refresh_all_materialized_views(concurrent := false);
