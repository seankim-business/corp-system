## Decisions (2026-01-26)

- Budget reset is manual-only via `resetMonthlyBudgets()` (no automatic scheduler) to respect org consent.
- Budget alerts are surfaced through logs + metrics (no email notifications yet).
- Budget overages are hard-blocked when remaining < $0.10 or estimated cost exceeds remaining.
- Token estimation uses lightweight category averages (no tiktoken dependency).
