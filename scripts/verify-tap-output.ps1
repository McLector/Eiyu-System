param(
  [Parameter(Mandatory = $true)][string]$LogDirectory,
  [int]$ExpectedFiles = 15
)

$ErrorActionPreference = 'Stop'
$files = @(Get-ChildItem -LiteralPath $LogDirectory -Filter '*.tap.log' -File)
if ($files.Count -ne $ExpectedFiles) {
  throw "Expected $ExpectedFiles TAP logs, found $($files.Count)."
}

$total = 0
foreach ($file in $files) {
  $lines = Get-Content -LiteralPath $file.FullName
  $results = @($lines | Where-Object { $_ -match '^ok\s+\d+' })
  $plans = @($lines | Where-Object { $_ -match '^1\.\.\d+$' })
  $failures = @($lines | Where-Object { $_ -match '^not ok\s|^Bail out!|ERROR:' })
  if ($plans.Count -ne 1 -or $failures.Count -gt 0) {
    throw "Invalid or failing TAP output: $($file.Name). Inspect the private log."
  }
  $expected = [int]$plans[0].Substring(3)
  if ($results.Count -ne $expected) {
    throw "Incomplete TAP output: $($file.Name) emitted $($results.Count) of $expected results."
  }
  for ($index = 0; $index -lt $results.Count; $index++) {
    $number = [int]([regex]::Match($results[$index], '^ok\s+(\d+)').Groups[1].Value)
    if ($number -ne $index + 1) {
      throw "Missing or duplicate TAP result number: $($file.Name)."
    }
  }
  $total += $results.Count
}

Write-Output "PASS: $($files.Count) TAP files; $total emitted assertions; every test plan complete."
