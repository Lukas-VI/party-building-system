[CmdletBinding()]
param(
  [string]$HostName = "192.168.31.135",
  [string]$UserName = "root",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\codex_vm_ed25519",
  [string]$RepoPath = "/opt/party-building-mini-app",
  [string]$Branch = "",
  [switch]$SkipPull
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Branch)) {
  $Branch = (git -C $PSScriptRoot\.. branch --show-current).Trim()
}

if (-not (Test-Path -LiteralPath $KeyPath)) {
  throw "SSH key not found: $KeyPath"
}

$remoteLines = @(
  "set -euo pipefail",
  "cd '$RepoPath'"
)

if (-not $SkipPull) {
  $remoteLines += "git fetch origin"
  $remoteLines += "git checkout '$Branch'"
  $remoteLines += "git pull --ff-only origin '$Branch'"
}

$remoteLines += "chmod +x '$RepoPath/scripts/start-ubuntu-services.sh'"
$remoteLines += "'$RepoPath/scripts/start-ubuntu-services.sh'"

$remoteScript = ($remoteLines -join "; ")
$remoteScriptBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))

ssh -i $KeyPath "$UserName@$HostName" "echo '$remoteScriptBase64' | base64 -d | bash"
