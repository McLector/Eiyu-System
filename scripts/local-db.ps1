[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'reset', 'lint', 'test', 'verify', 'status', 'stop')]
  [string] $Action = 'verify'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$supabaseNativeCli = Join-Path $projectRoot 'node_modules\@supabase\cli-windows-x64\bin\supabase.exe'
$supabaseCli = if (Test-Path -LiteralPath $supabaseNativeCli) {
  $supabaseNativeCli
} else {
  Join-Path $projectRoot 'node_modules\.bin\supabase.cmd'
}
$localNetwork = 'eiyu-supabase-local'
$excludedServices = 'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'

if (-not (Test-Path -LiteralPath $supabaseCli)) {
  throw 'The repository-local Supabase CLI is missing. Run npm install first.'
}

$dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
if ($dockerCommand) {
  $dockerCli = $dockerCommand.Source
} else {
  $dockerCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
    'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
  )
  $dockerCli = $dockerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

if (-not $dockerCli) {
  throw 'Docker CLI was not found. Install or start Docker Desktop before running local database commands.'
}

$dockerBin = Split-Path -Parent $dockerCli
$env:Path = "$dockerBin;$env:Path"

function Invoke-Checked {
  param(
    [Parameter(Mandatory)]
    [string] $Executable,
    [Parameter(Mandatory)]
    [string[]] $CommandArguments
  )

  & $Executable @CommandArguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Executable exited with code $LASTEXITCODE."
  }
}

function Ensure-LocalNetwork {
  $matchingNetworks = & $dockerCli network ls --filter "name=^$localNetwork`$" --format '{{.Name}}'
  if ($LASTEXITCODE -ne 0) {
    throw "$dockerCli could not list Docker networks (exit code $LASTEXITCODE)."
  }

  if ($matchingNetworks -contains $localNetwork) {
    return
  }

  Invoke-Checked -Executable $dockerCli -CommandArguments @(
    'network',
    'create',
    '--driver', 'bridge',
    '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
    $localNetwork
  )
}

function Invoke-Supabase {
  param([Parameter(Mandatory)][string[]] $CommandArguments)

  Push-Location $projectRoot
  try {
    # CLI 2.117 auto-detects coding agents and otherwise substitutes a limited
    # JSON-only command surface. This wrapper needs the normal local-dev CLI.
    Invoke-Checked -Executable $supabaseCli -CommandArguments (
      @('--agent', 'no', '--network-id', $localNetwork) + $CommandArguments
    )
  } finally {
    Pop-Location
  }
}

function Start-LocalStack {
  Write-Warning 'On Docker Desktop for Windows, the Supabase CLI may publish the database port on all host interfaces even when the Docker network requests loopback binding. Use this local stack only on a trusted network and stop it when finished.'
  Ensure-LocalNetwork
  Invoke-Supabase -CommandArguments @(
    'start',
    '--exclude', $excludedServices
  )
}

switch ($Action) {
  'start' {
    Start-LocalStack
  }
  'reset' {
    Invoke-Supabase -CommandArguments @('db', 'reset', '--local')
  }
  'lint' {
    Invoke-Supabase -CommandArguments @(
      'db', 'lint', '--local', '--schema', 'public', '--level', 'error', '--fail-on', 'error'
    )
  }
  'test' {
    Invoke-Supabase -CommandArguments @('test', 'db', '--local')
  }
  'verify' {
    Start-LocalStack
    try {
      Invoke-Supabase -CommandArguments @('db', 'reset', '--local')
      Invoke-Supabase -CommandArguments @(
        'db', 'lint', '--local', '--schema', 'public', '--level', 'error', '--fail-on', 'error'
      )
      Invoke-Supabase -CommandArguments @('test', 'db', '--local')
    } finally {
      Invoke-Supabase -CommandArguments @('stop')
    }
  }
  'status' {
    Invoke-Supabase -CommandArguments @('status', '--output', 'pretty')
  }
  'stop' {
    Invoke-Supabase -CommandArguments @('stop')
  }
}
