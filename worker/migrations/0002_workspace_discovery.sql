ALTER TABLE workspaces ADD COLUMN discovery_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_discovery_id
ON workspaces(discovery_id) WHERE discovery_id IS NOT NULL;