[CmdletBinding()]
param(
  [string]$HostName = "192.168.31.135",
  [string]$UserName = "root",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\codex_vm_ed25519",
  [string]$RepoPath = "/opt/party-building-mini-app",
  [string]$Branch = "",
  [string]$BundleName = "party-building-system.bundle"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($Branch)) {
  $Branch = (git -C $repoRoot branch --show-current).Trim()
}

if (-not (Test-Path -LiteralPath $KeyPath)) {
  throw "SSH key not found: $KeyPath"
}

$bundlePath = Join-Path $repoRoot ".tmp-ubuntu-deploy.bundle"
if (Test-Path -LiteralPath $bundlePath) {
  Remove-Item -LiteralPath $bundlePath -Force
}

Write-Host "[info] creating bundle from committed refs"
git -C $repoRoot bundle create $bundlePath main $Branch

Write-Host "[info] uploading bundle to ubuntu"
scp -i $KeyPath $bundlePath "$UserName@$HostName`:/tmp/$BundleName"

$remoteLines = @(
  "set -euo pipefail",
  "cd '$RepoPath'",
  "git remote set-url origin 'https://github.com/Lukas-VI/party-building-system'",
  "git fetch '/tmp/$BundleName' main:refs/remotes/bundle/main '$Branch':refs/remotes/bundle/$Branch",
  "if git show-ref --verify --quiet 'refs/heads/$Branch'; then git checkout '$Branch'; else git checkout -b '$Branch' 'refs/remotes/bundle/$Branch'; fi",
  "git merge --ff-only 'refs/remotes/bundle/$Branch'",
  "if git show-ref --verify --quiet 'refs/heads/main'; then git checkout main; git merge --ff-only 'refs/remotes/bundle/main'; fi",
  "git checkout '$Branch'",
  "rm -f '/tmp/$BundleName'",
  "bash '$RepoPath/scripts/start-ubuntu-services.sh'"
)

$remoteScript = ($remoteLines -join "; ")
$remoteScriptBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))

Write-Host "[info] syncing committed branch '$Branch' to ubuntu and restarting services"
ssh -i $KeyPath "$UserName@$HostName" "echo '$remoteScriptBase64' | base64 -d | bash"

if (Test-Path -LiteralPath $bundlePath) {
  Remove-Item -LiteralPath $bundlePath -Force
}

Write-Host "[info] deploy finished"
