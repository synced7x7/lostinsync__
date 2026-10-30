# Database plan

The current native migration creates `schema_migrations` and `app_state`. The complete typed application state (games, activities, journal, profile, and settings) is serialized as one versioned JSON document in `app_state` while the data model is still evolving. Migrations are applied once and recorded by version. The database is stored in the Tauri app data directory as `lost-in-sync.sqlite`.

Legacy game records may still contain historical playtime fields from an earlier build. They are retained for backward-compatible reads but are no longer editable or connected to a session timer.
