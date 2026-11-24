# 修复 LearnHarness 安装包缺失的 shiki 依赖（首页 500）
# 症状 / symptom:
#   Cannot find package '@shikijs/core' imported from .next\node_modules\shiki-*\dist\bundle-full.mjs
# 用法 / usage:
#   powershell -ExecutionPolicy Bypass -File scripts\fix-shiki-deps.ps1 [-Target <standalone dir>]

param(
    [string]$Target = ""
)

$ErrorActionPreference = 'Stop'

if (-not $Target) {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\learnharness\resources\server\standalone'),
        (Join-Path 'C:\Program Files' 'LearnHarness\resources\server\standalone'),
        '/Applications/LearnHarness.app/Contents/Resources/server/standalone',
        '/opt/LearnHarness/resources/server/standalone'
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path (Join-Path $c '.next'))) { $Target = $c; break }
    }
}

if (-not $Target -or -not (Test-Path (Join-Path $Target '.next'))) {
    Write-Output "ERROR: LearnHarness standalone dir not found. Pass -Target <.../resources/server/standalone>"
    exit 1
}

Write-Output "target: $Target"

$nextModules = Join-Path $Target '.next\node_modules'
$dst = Join-Path $nextModules '@shikijs'
$src = Join-Path $Target 'node_modules\@streamdown\code\node_modules\@shikijs'

if (-not (Test-Path $src)) {
    Write-Output "ERROR: bundled copy not found at $src"
    Write-Output "Workaround: npm i @shikijs/core@3.23.0 @shikijs/types@3.23.0 @shikijs/langs@3.23.0 @shikijs/themes@3.23.0 @shikijs/engine-javascript@3.23.0 @shikijs/engine-oniguruma@3.23.0"
    exit 1
}

$need = @('core', 'types', 'langs', 'themes', 'engine-javascript', 'engine-oniguruma')
$copied = 0
foreach ($name in $need) {
    $from = Join-Path $src $name
    if (-not (Test-Path $from)) { Write-Output "skip (missing in bundle): $name"; continue }
    if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst -Force | Out-Null }
    $to = Join-Path $dst $name
    if (Test-Path $to) { Write-Output "already present: @shikijs/$name"; continue }
    Copy-Item -Path $from -Destination $dst -Recurse -Force
    Write-Output "copied @shikijs/$name"
    $copied++
}

Write-Output "done. copied $copied package(s)."
Write-Output "Next: quit LearnHarness, clear %APPDATA%\LearnHarness\Cache, then relaunch."
