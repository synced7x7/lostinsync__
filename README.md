# Lost in Sync

An offline-first Windows game tracker starter built with React, Vite, TypeScript, and Tailwind CSS. The initial vertical slice is intentionally small: add a game, update its status, start/stop a manual session, and retain the data across restarts.

## Exact workspace paths

The current repository root is:

```text
C:\Users\Asus\Documents\JetbrainWorkspace\lostinsync__
```

Open that folder in VS Code and run all commands from it. The installed Rust toolchain is located at:

```text
C:\Users\Asus\.cargo\bin
```

`pnpm` is available at `C:\Users\Asus\AppData\Roaming\npm\pnpm.cmd`. Rust is installed, but `C:\Users\Asus\.cargo\bin` is not currently present in the terminal process `PATH`. Run `.\scripts\check-environment.ps1` to verify these locations.

## Run the web shell

```powershell
Set-Location 'C:\Users\Asus\Documents\JetbrainWorkspace\lostinsync__'
$env:Path = "C:\Users\Asus\.cargo\bin;$env:Path"
pnpm install
pnpm dev
```

The browser shell uses a local persistence adapter. The native Tauri shell uses SQLite in the Windows app data directory; the adapter boundary keeps the two environments consistent.

## Checks

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Run the native Windows application:

```powershell
Set-Location 'C:\Users\Asus\Documents\JetbrainWorkspace\lostinsync__'
$env:Path = "C:\Users\Asus\.cargo\bin;$env:Path"
pnpm tauri:dev
```

Create a Windows installer:

```powershell
pnpm tauri:build
```

The `$env:Path` line applies Rust to the current PowerShell session. To add it permanently to the user PATH, run this once:

```powershell
[Environment]::SetEnvironmentVariable(
  "Path",
  [Environment]::GetEnvironmentVariable("Path", "User") + ";C:\Users\Asus\.cargo\bin",
  "User"
)
```

## Architecture

- `src/domain` contains status values, validation, and timestamp-based duration rules.
- `src/data` contains the repository contract and a browser persistence adapter.
- `src/main.tsx` contains the initial vertical slice UI.
- `docs/` records the SQLite and Tauri migration plan.

The repository uses `src/` directly at the root and the native Tauri project at `src-tauri/`.
