# Database plan

The current native migration creates `schema_migrations` and `games`, including the fields needed by the first vertical slice. Migrations are applied once inside a transaction and recorded by version. IDs are generated UUIDs, timestamps are stored as UTC ISO-8601 text, and foreign keys plus indexes are enabled on every relationship. The database is stored in the Tauri app data directory as `lost-in-sync.sqlite`.

`play_sessions` stores `started_at`, `ended_at`, and `duration_seconds`; an active session has a null end and is unique per library entry. On startup, an active session is recovered from its timestamp rather than a counter. Later migrations add profile, journal, settings, and log tables.
