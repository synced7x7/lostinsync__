# Architecture

The current slice keeps domain rules (`src/domain`) independent from persistence (`src/data`) and UI (`src/main.tsx`). `GameRepository` is the replacement seam for a Tauri command client; React never owns SQL or timer arithmetic. The browser adapter is development-only persistence and uses `localStorage` to prove restart durability.

The current repository root is `C:\Users\Asus\Documents\JetbrainWorkspace\lostinsync__`. The planned native layout is `src-tauri/` at that root, containing Rust commands and migrations. If the project grows into a monorepo, the reusable domain module can move to `packages/domain`; it is currently at `src/domain/`. A future process monitor must implement a dedicated event interface and remain outside the domain package.
