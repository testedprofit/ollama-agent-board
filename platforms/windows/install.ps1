param(
  [switch]$InstallMissing,
  [switch]$SkipModelPull,
  [string]$Model = "llama3.2"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

function Test-Command {
  param([string]$Name)
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-WingetPackage {
  param(
    [string]$Id,
    [string]$Name
  )

  if (-not (Test-Command winget)) {
    throw "winget is not available. Install $Name manually, then rerun this script."
  }

  Write-Host "Installing $Name with winget..."
  winget install --id $Id --exact --accept-package-agreements --accept-source-agreements
}

function Ensure-Command {
  param(
    [string]$Command,
    [string]$WingetId,
    [string]$DisplayName,
    [string]$ManualUrl
  )

  if (Test-Command $Command) {
    Write-Host "$DisplayName detected."
    return
  }

  if ($InstallMissing) {
    Install-WingetPackage -Id $WingetId -Name $DisplayName
    return
  }

  throw "$DisplayName is missing. Install it from $ManualUrl or rerun with -InstallMissing."
}

Ensure-Command -Command git -WingetId "Git.Git" -DisplayName "Git" -ManualUrl "https://git-scm.com/install/windows"
Ensure-Command -Command node -WingetId "OpenJS.NodeJS.LTS" -DisplayName "Node.js LTS" -ManualUrl "https://nodejs.org/en/download"
Ensure-Command -Command npm -WingetId "OpenJS.NodeJS.LTS" -DisplayName "npm" -ManualUrl "https://nodejs.org/en/download"
Ensure-Command -Command ollama -WingetId "Ollama.Ollama" -DisplayName "Ollama" -ManualUrl "https://ollama.com/download/windows"

Push-Location $RepoRoot
try {
  npm install

  if (-not $SkipModelPull) {
    Write-Host "Pulling Ollama model $Model..."
    ollama pull $Model
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Install complete."
Write-Host "Run: powershell -ExecutionPolicy Bypass -File .\platforms\windows\run.ps1"
