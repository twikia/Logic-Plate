param(
  [switch]$Force,
  [string]$RemoteUrl = "git@github.com:twikia/Platebound.git"
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path $PSScriptRoot -Parent
Set-Location $Repo

Write-Host ""
Write-Host "=== Purge .env and scratch secrets from git history ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This rewrites ALL commits. You must rotate Supabase, APP_SECRET, and Google Maps keys"
Write-Host "BEFORE or immediately AFTER, then force-push. See docs/SECURITY-AUDIT.md."
Write-Host ""

$envHits = git log --all --oneline -- .env 2>$null
if (-not $envHits) {
  Write-Host "No .env in git history - nothing to purge." -ForegroundColor Green
  exit 0
}

Write-Host "Commits touching .env (sample):"
$envHits | Select-Object -First 5 | ForEach-Object { Write-Host "  $_" }

if (-not $Force) {
  Write-Host ""
  Write-Host "Dry run only. Re-run with -Force after backing up the repo and rotating keys." -ForegroundColor Yellow
  Write-Host "  .\scripts\purge-secrets-from-history.ps1 -Force"
  exit 1
}

$backup = Join-Path (Split-Path $Repo -Parent) "Platebound-backup.git"
if (-not (Test-Path $backup)) {
  Write-Host "Creating mirror backup at $backup ..."
  git clone --mirror $RemoteUrl $backup
}

$originBefore = (git remote get-url origin 2>$null)
if ($originBefore) { $RemoteUrl = $originBefore }

Write-Host "Removing .env from history ..."
python -m git_filter_repo --path .env --invert-paths --force

Write-Host "Removing scratch/test_api.js from history ..."
python -m git_filter_repo --path scratch/test_api.js --invert-paths --force

if (-not (git remote 2>$null)) {
  git remote add origin $RemoteUrl
}

Write-Host ""
Write-Host "Done. Verify:" -ForegroundColor Green
Write-Host '  git log --all -- .env'
Write-Host ""
Write-Host "Then force-push (coordinate with collaborators first):" -ForegroundColor Yellow
Write-Host '  git push origin --force --all'
Write-Host '  git push origin --force --tags'
