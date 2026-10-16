param(
  [string]$Connection,
  [string]$Project,
  [ValidateSet('vscode', 'desktop', 'auto')][string]$Transport,
  [ValidateSet('vscode', 'desktop')][string]$Preferred,
  [switch]$Check
)
$ErrorActionPreference = 'Stop'
$installerPath = Join-Path $PSScriptRoot 'skills/ocr-kanban-setup/scripts/setup.ps1'
$installerArgs = @{}
if ($Connection) { $installerArgs.Connection = $Connection }
if ($Project) { $installerArgs.Project = $Project }
if ($Transport) { $installerArgs.Transport = $Transport }
if ($Preferred) { $installerArgs.Preferred = $Preferred }
if ($Check) { $installerArgs.Check = $true }
& $installerPath @installerArgs
