[CmdletBinding()]
param(
  [string]$HostName = "192.168.31.135",
  [string]$UserName = "root",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\codex_vm_ed25519",
  [string]$RepoPath = "/opt/party-building-mini-app",
  [string]$Branch = "",
  [string]$BundleName = "party-building-sync.bundle"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($Branch)) {
  $Branch = (git -C $repoRoot branch --show-current).Trim()
}

if ([string]::IsNullOrWhiteSpace($Branch)) {
  throw "Unable to detect current git branch."
}

if (-not (Test-Path -LiteralPath $KeyPath)) {
  throw "SSH key not found: $KeyPath"
}

$tempDir = Join-Path $env:TEMP "party-building-deploy"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
$bundlePath = Join-Path $tempDir $BundleName

Write-Host "[info] repo: $repoRoot"
Write-Host "[info] branch: $Branch"
Write-Host "[info] bundle: $bundlePath"

git -C $repoRoot rev-parse --verify HEAD | Out-Null
$bundleRefs = @("main")
if ($Branch -ne "main") {
  $bundleRefs += $Branch
}
git -C $repoRoot bundle create $bundlePath @bundleRefs

$remoteBundlePath = "/tmp/$BundleName"
scp -i $KeyPath $bundlePath "${UserName}@${HostName}:$remoteBundlePath" | Out-Null

$remoteLines = @(
  "set -euo pipefail",
  "cd '$RepoPath'",
  "git remote set-url origin 'https://github.com/Lukas-VI/party-building-system'",
  "git fetch '$remoteBundlePath' '+refs/heads/*:refs/remotes/local-bundle/*'",
  "if git show-ref --verify --quiet refs/remotes/local-bundle/main; then git checkout -B main refs/remotes/local-bundle/main; fi",
  "if [ '$Branch' != 'main' ] && git show-ref --verify --quiet refs/remotes/local-bundle/$Branch; then git checkout -B '$Branch' refs/remotes/local-bundle/$Branch; fi",
  "rm -f '$remoteBundlePath'",
  "bash '$RepoPath/scripts/start-ubuntu-services.sh'"
)

$remoteScript = ($remoteLines -join "; ")
$remoteScriptBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))
ssh -i $KeyPath "$UserName@$HostName" "echo '$remoteScriptBase64' | base64 -d | bash"

Remove-Item -LiteralPath $bundlePath -Force -ErrorAction SilentlyContinue
Write-Host "[info] deploy finished"
