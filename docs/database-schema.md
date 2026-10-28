# Database plan

The current native migration creates `schema_migrations` and `app_state`. The complete typed application state (games, activities, journal, profile, and settings) is serialized as one versioned JSON document in `app_state` while the data model is still evolving. Migrations are applied once and recorded by version. The database is stored in the Tauri app data directory as `lost-in-sync.sqlite`. A future migration can normalize high-volume session records into relational tables without changing the repository contract.

`play_sessions` stores `started_at`, `ended_at`, and `duration_seconds`; an active session has a null end and is unique per library entry. On startup, an active session is recovered from its timestamp rather than a counter. Later migrations add profile, journal, settings, and log tables.
