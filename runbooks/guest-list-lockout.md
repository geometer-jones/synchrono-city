# Guest List Lockout

## Signal

- Approved members cannot publish or request tokens
- The relay appears healthy but all restricted writes fail
- Admin changes may have revoked too much access

## Immediate Actions

1. Inspect the most recent `policy_assignments` and `standing_records` entries.
2. Confirm whether a broad revocation or malformed scope caused the lockout.
3. Use the bootstrap operator pubkey to restore at least one owner account.

## Recovery

1. Re-issue the minimum owner and moderator grants needed for recovery.
2. Validate a fresh NIP-98 authenticated publish and token request.
3. Review audit history for the change that triggered the lockout.

## Follow-Up

- Add a regression test for the misconfiguration path.
- Require dual confirmation for relay-wide revocations if this becomes recurrent.
