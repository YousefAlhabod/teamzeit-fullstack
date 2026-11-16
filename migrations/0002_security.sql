CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_password_resets_expiry ON password_resets(expires_at);
CREATE TABLE request_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
-- The constraint makes invite consumption transactional even with concurrent requests.
CREATE TRIGGER invitation_capacity BEFORE UPDATE OF uses ON invitations
WHEN NEW.uses > NEW.max_uses OR NEW.expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
BEGIN
  SELECT RAISE(ABORT, 'Invitation unavailable');
END;
-- Setup may create only one initial trainer, including concurrent setup requests.
CREATE TABLE setup_lock (id INTEGER PRIMARY KEY CHECK (id = 1));
INSERT INTO setup_lock(id) SELECT 1 WHERE EXISTS (SELECT 1 FROM users);
