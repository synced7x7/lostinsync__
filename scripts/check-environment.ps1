$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\Asus\Documents\JetbrainWorkspace\lostinsync__"
$cargoBin = "C:\Users\Asus\.cargo\bin"
$pnpmCommand = "C:\Users\Asus\AppData\Roaming\npm\pnpm.cmd"

Write-Host "Project root: $projectRoot"
if (-not (Test-Path $projectRoot)) {
  throw "Project root does not exist: $projectRoot"
}

if (-not (Test-Path $pnpmCommand)) {
  throw "pnpm was not found at: $pnpmCommand"
}
& $pnpmCommand --version

$rustcCommand = Join-Path $cargoBin "rustc.exe"
$cargoCommand = Join-Path $cargoBin "cargo.exe"
if (-not (Test-Path $rustcCommand)) {
  throw "rustc was not found at: $rustcCommand"
}
if (-not (Test-Path $cargoCommand)) {
  throw "cargo was not found at: $cargoCommand"
}
& $rustcCommand --version
& $cargoCommand --version

Write-Host "Environment paths are valid."
