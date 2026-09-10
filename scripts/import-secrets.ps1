# ============================================================
# 一键导入 Android Secrets 到 GitHub Actions
# 前提：winget install GitHub.cli ; gh auth login
# 用法：
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\scripts\import-secrets.ps1
# ============================================================
$secretsFile = Join-Path $PSScriptRoot '..\.secrets.env'
if (-not (Test-Path $secretsFile)) {
    Write-Host "ERROR: .secrets.env not found in project root" -ForegroundColor Red
    exit 1
}

# Parse .env file (skip comments and blanks)
$pairs = @{}
foreach ($line in Get-Content $secretsFile) {
    if ($line -match '^\s*#' -or $line -match '^\s*$') { continue }
    $parts = $line -split '=', 2
    if ($parts.Length -eq 2) {
        $name = $parts[0].Trim()
        $val  = $parts[1].Trim()
        if ($name -match '^ANDROID_') {
            $pairs[$name] = $val
        }
    }
}

Write-Host "=== Android Secrets to import ===" -ForegroundColor Cyan
foreach ($k in $pairs.Keys) {
    $v = $pairs[$k]
    $display = if ($v.Length -gt 30) { "($($v.Length) chars)" } else { "= $v" }
    Write-Host "  $k $display"
}
Write-Host ""

# Check gh CLI
try { gh --version | Out-Null } catch {
    Write-Host "gh CLI not found. Run: winget install GitHub.cli" -ForegroundColor Red
    exit 1
}

# Check auth
$me = gh api user 2>&1 | ConvertFrom-Json -ErrorAction SilentlyContinue
if (-not $me -or -not $me.login) {
    Write-Host "gh not logged in. Run: gh auth login" -ForegroundColor Yellow
    Write-Host "  Choose HTTPS + Browser, simplest way."
    exit 1
}
Write-Host "Logged in as: $($me.login)" -ForegroundColor Green

# Check current repo
$repo = gh repo view --json nameWithOwner 2>&1 | ConvertFrom-Json -ErrorAction SilentlyContinue
if (-not $repo) {
    Write-Host "Not in a GitHub repo. Push first:" -ForegroundColor Red
    Write-Host "  git remote add origin https://github.com/<user>/<repo>.git"
    Write-Host "  git push -u origin main"
    exit 1
}
Write-Host "Target repo: $($repo.nameWithOwner)" -ForegroundColor Green
Write-Host ""

# Set each secret
foreach ($k in $pairs.Keys) {
    Write-Host "Setting $k ..." -NoNewline
    $pairs[$k] | gh secret set $k 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green }
    else { Write-Host " FAILED" -ForegroundColor Red }
}

Write-Host ""
Write-Host "=== Verify ===" -ForegroundColor Cyan
gh secret list | Select-String "ANDROID_"
Write-Host ""
Write-Host "Done. Next: git tag v16 && git push origin v16"
Write-Host "   Or run Actions manually in GitHub UI."
