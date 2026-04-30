[CmdletBinding()]
param(
  [string]$VmPath = (Join-Path "D:\Users\lupo\Documents\Virtual Machines" ("Ubuntu 64 {0}\Ubuntu 64 {0}.vmx" -f [char]0x4F4D)),
  [string]$HostName = "192.168.31.135",
  [int]$SshPort = 22,
  [int]$StartupTimeoutSeconds = 180,
  [int]$PollSeconds = 5,
  [string]$VmrunPath = ""
)

$ErrorActionPreference = "Stop"

function Test-TcpPort {
  param(
    [Parameter(Mandatory = $true)][string]$ComputerName,
    [Parameter(Mandatory = $true)][int]$Port,
    [int]$TimeoutMilliseconds = 1500
  )

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $async = $client.BeginConnect($ComputerName, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)) {
      return $false
    }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Resolve-VmrunPath {
  param([string]$PreferredPath)

  if (-not [string]::IsNullOrWhiteSpace($PreferredPath)) {
    if (Test-Path -LiteralPath $PreferredPath) {
      return (Resolve-Path -LiteralPath $PreferredPath).Path
    }
    throw "vmrun not found: $PreferredPath"
  }

  $candidates = @(
    "${env:ProgramFiles(x86)}\VMware\VMware Workstation\vmrun.exe",
    "$env:ProgramFiles\VMware\VMware Workstation\vmrun.exe"
  )

  $command = Get-Command vmrun.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  throw "vmrun.exe not found. Install VMware Workstation or pass -VmrunPath."
}

if (-not (Test-Path -LiteralPath $VmPath)) {
  throw "VMX file not found: $VmPath"
}

$resolvedVmPath = (Resolve-Path -LiteralPath $VmPath).Path

if (Test-TcpPort -ComputerName $HostName -Port $SshPort) {
  Write-Host "[info] test Ubuntu already reachable: ${HostName}:${SshPort}"
  exit 0
}

$resolvedVmrunPath = Resolve-VmrunPath -PreferredPath $VmrunPath
Write-Host "[info] vmrun: $resolvedVmrunPath"
Write-Host "[info] vmx: $resolvedVmPath"

$runningVms = & $resolvedVmrunPath list 2>$null
$isRunning = $false
foreach ($line in $runningVms) {
  if ($line.Trim() -ieq $resolvedVmPath) {
    $isRunning = $true
    break
  }
}

if ($isRunning) {
  Write-Host "[info] test Ubuntu VM is already running; waiting for SSH"
} else {
  Write-Host "[info] starting test Ubuntu VM"
  & $resolvedVmrunPath start $resolvedVmPath nogui
}

$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  if (Test-TcpPort -ComputerName $HostName -Port $SshPort) {
    Write-Host "[info] test Ubuntu SSH ready: ${HostName}:${SshPort}"
    exit 0
  }

  Write-Host "[info] waiting for test Ubuntu SSH: ${HostName}:${SshPort}"
  Start-Sleep -Seconds $PollSeconds
}

throw "Timed out waiting for test Ubuntu SSH: ${HostName}:${SshPort}"
