# Spam Attack

## Signal

- Relay publish rate spikes sharply
- Moderator queue volume increases
- Rate-limit violations appear for many pubkeys

## Immediate Actions

1. Confirm the attack pattern through relay logs and per-pubkey counters.
2. Raise rate limits only if legitimate traffic is being throttled; otherwise tighten write policy.
3. Apply local suspensions or bans through Concierge for the worst offending pubkeys.

## Recovery

1. Monitor whether publish rejection rate returns to baseline.
2. Review guest-list or OAuth gates if the relay remains under pressure.
3. Preserve representative spam samples for later rule tuning.

## Follow-Up

- Document which controls were effective.
- Add detection improvements if the attack bypassed current thresholds.
