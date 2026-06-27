param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 5173
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

function Test-OllamaReady {
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 3 | Out-Null
    return $true
  } catch {
    return $false
  }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is missing. Run .\platforms\windows\install.ps1 first."
}

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  throw "Ollama is missing. Run .\platforms\windows\install.ps1 first."
}

if (-not (Test-OllamaReady)) {
  Write-Host "Starting Ollama in the background..."
  Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

Push-Location $RepoRoot
try {
  if (-not (Test-Path "node_modules")) {
    npm install
  }

  if (-not $env:OLLAMA_HOST) {
    $env:OLLAMA_HOST = "http://127.0.0.1:11434"
  }
  npm run dev -- --host $HostName --port $Port
} finally {
  Pop-Location
}
