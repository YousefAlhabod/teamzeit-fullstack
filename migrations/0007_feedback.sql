CREATE TABLE feedback (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('comment','improvement','feature')),
 content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 2000),
 created_at TEXT NOT NULL
);
CREATE INDEX idx_feedback_user ON feedback(user_id,id);
