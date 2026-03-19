CREATE INDEX idx_room_permissions_subject_room
  ON room_permissions (subject_pubkey, room_id);

CREATE INDEX idx_room_permissions_room_id
  ON room_permissions (room_id);
