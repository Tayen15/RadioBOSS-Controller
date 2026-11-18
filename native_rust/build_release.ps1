# Build and stage release binary RCBStudio.exe for Inno Setup & Portable distribution
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $Root "dist"

Push-Location $PSScriptRoot
try {
    cargo test
    if ($LASTEXITCODE -ne 0) { throw "Unit tests failed" }

    cargo build --release
    if ($LASTEXITCODE -ne 0) { throw "Release build failed" }

    New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
    Copy-Item "target\release\RCBStudio.exe" (Join-Path $DistDir "RCBStudio.exe") -Force

    $exeInfo = Get-Item (Join-Path $DistDir "RCBStudio.exe")
    Write-Host ("Staged: {0} ({1:N2} MB)" -f $exeInfo.FullName, ($exeInfo.Length / 1MB))
}
finally {
    Pop-Location
}
