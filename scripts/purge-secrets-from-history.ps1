param(
  [switch]$Force,
  [string]$RemoteUrl = "git@github.com:twikia/Logic-Plate.git"
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path $PSScriptRoot -Parent
Set-Location $Repo

Write-Host ""
Write-Host "=== Purge .env and scratch secrets from git history ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This rewrites ALL local commits. GitHub pull-request refs (refs/pull/*) cannot"
Write-Host "be overwritten. If GitGuardian still sees .env after a branch rewrite, those"
Write-Host "commits live on old PRs — replace the GitHub repo (or delete it and push a"
Write-Host "clean history). Rotate Supabase, APP_SECRET, and Google Maps keys."
Write-Host "See docs/SECURITY-AUDIT.md."
Write-Host ""

Write-Host "Fetching GitHub PR heads so they are included in the scan..."
git fetch origin "+refs/pull/*/head:refs/remotes/origin/pr/*" 2>$null

$envHits = git log --all --oneline -- .env 2>$null
if (-not $envHits) {
  Write-Host "No .env in reachable local refs (including fetched PR heads)." -ForegroundColor Green
  Write-Host "If GitGuardian still reports .env, GitHub still has hidden PR refs you cannot push over."
  exit 0
}

Write-Host "Commits touching .env (sample):"
$envHits | Select-Object -First 8 | ForEach-Object { Write-Host "  $_" }

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

if (Test-Path .git\filter-repo\already_ran) {
  Remove-Item -Force .git\filter-repo\already_ran
}

Write-Host "Removing secret-bearing paths from history ..."
python -m git_filter_repo `
  --invert-paths `
  --path .env `
  --path scratch/test_api.js `
  --path platebound-2.1-v4.apks `
  --path tools/platebound-2.1-v4.zip `
  --force

if (-not (git remote 2>$null)) {
  git remote add origin $RemoteUrl
} else {
  git remote set-url origin $RemoteUrl
}

Write-Host ""
Write-Host "Done. Verify:" -ForegroundColor Green
Write-Host '  git log --all -- .env'
Write-Host ""
Write-Host "Then force-push branches only (not refs/pull/*):" -ForegroundColor Yellow
Write-Host '  git push origin --force main'
Write-Host "GitHub will reject updates to refs/pull/*. If alerts remain, create a new"
Write-Host "GitHub repo, push only main, and delete the old repository."
