package store

import (
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const defaultListLimit = 20

func clampLimit(limit int) int {
	if limit <= 0 {
		return defaultListLimit
	}
	if limit > 100 {
		return 100
	}
	return limit
}

func encodeAuditCursor(entry AuditEntry) string {
	return base64.StdEncoding.EncodeToString([]byte(
		fmt.Sprintf("%d:%d", entry.CreatedAt.UTC().UnixNano(), entry.ID),
	))
}

func decodeAuditCursor(cursor string) (time.Time, int64, error) {
	if strings.TrimSpace(cursor) == "" {
		return time.Time{}, 0, nil
	}

	raw, err := base64.StdEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, 0, fmt.Errorf("decode audit cursor: %w", err)
	}

	parts := strings.SplitN(string(raw), ":", 2)
	if len(parts) != 2 {
		return time.Time{}, 0, fmt.Errorf("invalid audit cursor")
	}

	unixNano, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return time.Time{}, 0, fmt.Errorf("parse audit cursor time: %w", err)
	}
	id, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return time.Time{}, 0, fmt.Errorf("parse audit cursor id: %w", err)
	}

	return time.Unix(0, unixNano).UTC(), id, nil
}
