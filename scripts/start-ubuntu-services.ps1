[CmdletBinding()]
param(
  [string]$HostName = "192.168.31.135",
  [string]$UserName = "root",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\codex_vm_ed25519",
  [string]$RepoPath = "/opt/party-building-mini-app",
  [string]$Branch = "",
  [switch]$SkipPull,
  [string]$VmPath = (Join-Path "D:\Users\lupo\Documents\Virtual Machines" ("Ubuntu 64 {0}\Ubuntu 64 {0}.vmx" -f [char]0x4F4D)),
  [int]$VmStartupTimeoutSeconds = 180,
  [switch]$SkipVmStart
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Branch)) {
  $Branch = (git -C $PSScriptRoot\.. branch --show-current).Trim()
}

if (-not $SkipVmStart) {
  & (Join-Path $PSScriptRoot "start-test-ubuntu-vm.ps1") `
    -VmPath $VmPath `
    -HostName $HostName `
    -StartupTimeoutSeconds $VmStartupTimeoutSeconds
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

$remoteLines += "bash '$RepoPath/scripts/start-ubuntu-services.sh'"

$remoteScript = ($remoteLines -join "; ")
$remoteScriptBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))

ssh -i $KeyPath "$UserName@$HostName" "echo '$remoteScriptBase64' | base64 -d | bash"
