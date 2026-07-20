PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  auth_verifier TEXT NOT NULL,
  salt TEXT NOT NULL,
  kdf_iterations INTEGER NOT NULL CHECK (kdf_iterations >= 100000),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  workspace_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('place', 'memory', 'settings', 'playlist')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  nonce TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  PRIMARY KEY (workspace_id, record_id, kind),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  revision INTEGER NOT NULL,
  changed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_changes_workspace_seq ON changes(workspace_id, seq);
CREATE INDEX IF NOT EXISTS idx_records_workspace_updated ON records(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_records_deleted ON records(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS records_after_insert
AFTER INSERT ON records
BEGIN
  INSERT INTO changes(workspace_id, record_id, kind, revision, changed_at)
  VALUES (NEW.workspace_id, NEW.record_id, NEW.kind, NEW.revision, unixepoch('subsec') * 1000);
END;

CREATE TRIGGER IF NOT EXISTS records_after_update
AFTER UPDATE ON records
BEGIN
  INSERT INTO changes(workspace_id, record_id, kind, revision, changed_at)
  VALUES (NEW.workspace_id, NEW.record_id, NEW.kind, NEW.revision, unixepoch('subsec') * 1000);
END;
