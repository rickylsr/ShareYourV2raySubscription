CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS editor_sessions (
    id TEXT PRIMARY KEY, username TEXT NOT NULL, version TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expiry ON editor_sessions(expires);
CREATE TABLE IF NOT EXISTS login_attempts (
    peer TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attempt_expiry ON login_attempts(expires);
