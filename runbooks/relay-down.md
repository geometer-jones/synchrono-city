# Relay Down

## Signal

- Relay health checks fail
- Clients cannot subscribe or publish
- Concierge health remains green

## Immediate Actions

1. Confirm whether the relay process is down or unreachable from the network edge.
2. Verify the Concierge circuit breaker has opened and clients are failing closed.
3. Check recent deploys or config changes affecting the relay bind address or storage path.

## Recovery

1. Restart the relay process.
2. Validate websocket connectivity from a local client.
3. Confirm publish authorization is succeeding again through the policy shim.

## Follow-Up

- Capture outage start and end time in the incident log.
- Record whether queued client writes drained successfully after recovery.
