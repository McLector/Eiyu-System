param(
  [Parameter(Mandatory = $true)][string]$AndroidAppBuildDirectory,
  [Parameter(Mandatory = $true)][string]$ApkPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$buildRoot = (Resolve-Path -LiteralPath $AndroidAppBuildDirectory).Path
$apk = (Resolve-Path -LiteralPath $ApkPath).Path
$bundle = Join-Path $buildRoot 'intermediates/assets/release/mergeReleaseAssets/index.android.bundle'
$sourceMap = Join-Path $buildRoot 'intermediates/sourcemaps/react/release/index.android.bundle.packager.map'

# Check the bytes actually packaged, rather than APK size or task timestamps.
$archive = [System.IO.Compression.ZipFile]::OpenRead($apk)
try {
  $entry = $archive.GetEntry('assets/index.android.bundle')
  if (-not $entry) { throw 'APK has no embedded Android bundle.' }
  $stream = $entry.Open()
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $embeddedHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '')
  } finally {
    $stream.Dispose()
    $sha.Dispose()
  }
  if ($embeddedHash -ne (Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash) {
    throw 'APK bundle does not match the merged release bundle.'
  }
} finally {
  $archive.Dispose()
}

# Multiple module identities create separate contexts even at the same version.
$map = Get-Content -LiteralPath $sourceMap -Raw | ConvertFrom-Json
foreach ($module in @('ExpoRoot.js', 'layouts/StackClient.js', 'link/preview/LinkPreviewContext.js', 'link/InternalLinkPreviewContext.js')) {
  $suffix = '/expo-router/build/' + $module
  $sources = @($map.sources | ForEach-Object { $_.Replace('\', '/') } |
    Where-Object { $_.EndsWith($suffix) } | Select-Object -Unique)
  if ($sources.Count -ne 1) {
    throw "Release bundle contains $($sources.Count) module identities for expo-router/$module; expected one."
  }
}

Write-Output 'PASS: embedded bundle matches merged output; Expo Router contexts have one module identity.'
