param([string]$Connection, [string]$Project, [ValidateSet('vscode','desktop','auto')][string]$Transport, [ValidateSet('vscode','desktop')][string]$Preferred, [switch]$Check)
$ErrorActionPreference = 'Stop'
$bundleRoot = Split-Path $PSScriptRoot -Parent
$nodeVersion = '24.22.0'
$nodeArch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
$expectedHash = if ($nodeArch -eq 'arm64') { '3a5c209a5bc59e65b3bc0fa13ed5e166a26bd3d55332847f498b76b037408d61' } else { 'f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3' }
$privateTemp = Join-Path ([IO.Path]::GetTempPath()) ('ocr-kanban-setup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $privateTemp | Out-Null
try {
  $archive = Join-Path $privateTemp 'node.zip'
  Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-win-$nodeArch.zip" -OutFile $archive
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Node.js checksum mismatch' }
  Expand-Archive -LiteralPath $archive -DestinationPath $privateTemp
  $nodePath = Join-Path $privateTemp "node-v$nodeVersion-win-$nodeArch/node.exe"
  $setupArgs = @((Join-Path $bundleRoot 'scripts/wizard.mjs'), '--bundle', (Join-Path $bundleRoot 'assets'))
  if ($Connection) { $setupArgs += @('--connection', $Connection) }
  if ($Project) { $setupArgs += @('--project', $Project) }
  if ($Transport) { $setupArgs += @('--transport', $Transport) }
  if ($Preferred) { $setupArgs += @('--preferred', $Preferred) }
  if ($Check) { $setupArgs += '--check' }
  & $nodePath @setupArgs
  if ($LASTEXITCODE -ne 0) { throw 'OCR Kanban installation did not complete' }
} finally {
  $checkedTemp = [IO.Path]::GetFullPath($privateTemp)
  $expectedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if ($checkedTemp.StartsWith($expectedParent, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $checkedTemp -Leaf).StartsWith('ocr-kanban-setup-')) { Remove-Item -LiteralPath $checkedTemp -Recurse -Force }
}
