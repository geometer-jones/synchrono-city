# Postgres Down

## Signal

- Concierge returns storage-related errors
- Health checks fail due to database connectivity
- Policy and session reads time out

## Immediate Actions

1. Confirm the database process is reachable on the expected host and port.
2. Check connection count, disk saturation, and recent restart history.
3. If the database is recovering, hold admin writes until health stabilizes.

## Recovery

1. Restore database availability.
2. Run a read-only smoke test against `policy_assignments`, `standing_records`, and `audit_log`.
3. Re-enable admin actions and token vending once query latency returns to normal.

## Follow-Up

- Capture root cause and recovery time.
- Review whether connection pool settings need adjustment.
