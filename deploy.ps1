# This script pushes Supabase database migrations and deploys edge functions.

Write-Host "Pushing Database Migrations..." -ForegroundColor Cyan
npx supabase db push

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to push database changes. Stopping deployment." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Deploying Edge Functions (with --no-verify-jwt)..." -ForegroundColor Cyan
npx supabase functions deploy --no-verify-jwt

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Failed to deploy edge functions." -ForegroundColor Red
}
