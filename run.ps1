[CmdletBinding()]
param(
  [switch]$Tests,
  [switch]$NoBackend,
  [switch]$Open
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$frontendDir = Join-Path $root 'frontend'
$backendDir = Join-Path $root 'backend\app'
$vitePath = Join-Path $frontendDir 'node_modules\vite\bin\vite.js'

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
$python = Get-Command py -ErrorAction SilentlyContinue
if (-not $python) {
  $python = Get-Command python -ErrorAction SilentlyContinue
}

if (-not $node) { throw 'Node.js is required but was not found on PATH.' }
if ($Tests -and -not $npm) { throw 'npm is required for -Tests but was not found on PATH.' }
if ((-not $NoBackend -or $Tests) -and -not $python) {
  throw 'Python is required for the backend but was not found on PATH.'
}
if (-not (Test-Path -LiteralPath $vitePath)) {
  throw "Frontend dependencies are missing. Run: cd frontend; npm install"
}

if ($env:DECKSTERITY_SECRET_KEY) {
  $secretKey = $env:DECKSTERITY_SECRET_KEY
} else {
  $secretKey = 'dev-only'
  Write-Host 'DECKSTERITY_SECRET_KEY is unset; using dev-only for this run.' -ForegroundColor Yellow
}

$env:DECKSTERITY_SECRET_KEY = $secretKey
$env:PYTHONDONTWRITEBYTECODE = '1'

if ($Tests) {
  Push-Location $frontendDir
  try {
    Invoke-Step 'Frontend tests' { & $npm.Source test }
    Invoke-Step 'Frontend lint' { & $npm.Source run lint }
    Invoke-Step 'Frontend build' { & $npm.Source run build }
  } finally {
    Pop-Location
  }

  Push-Location $backendDir
  try {
    Invoke-Step 'Backend import' { & $python.Source -c 'import main' }
  } finally {
    Pop-Location
  }

  Write-Host 'All checks passed.' -ForegroundColor Green
  exit 0
}

if (-not $NoBackend) {
  Push-Location $backendDir
  try {
    & $python.Source -c 'import main'
    if ($LASTEXITCODE -ne 0) {
      throw 'Backend import failed. Install dependencies with: py -m pip install -r backend/requirements.txt'
    }
  } finally {
    Pop-Location
  }
}

$backendProcess = $null
$frontendProcess = $null

try {
  if (-not $NoBackend) {
    $backendProcess = Start-Process `
      -FilePath $python.Source `
      -ArgumentList @('-m', 'uvicorn', 'main:master_app', '--host', '127.0.0.1', '--port', '8000') `
      -WorkingDirectory $backendDir `
      -NoNewWindow `
      -PassThru
  }

  $viteArg = '"{0}"' -f $vitePath
  $frontendProcess = Start-Process `
    -FilePath $node.Source `
    -ArgumentList @($viteArg, '--host', '127.0.0.1', '--port', '5173', '--strictPort') `
    -WorkingDirectory $frontendDir `
    -NoNewWindow `
    -PassThru

  Start-Sleep -Seconds 1

  if ($backendProcess -and $backendProcess.HasExited) {
    throw 'Backend exited during startup. Check whether port 8000 is already in use.'
  }
  if ($frontendProcess.HasExited) {
    throw 'Frontend exited during startup. Check whether port 5173 is already in use.'
  }

  Write-Host ''
  Write-Host 'Decksterity is running:' -ForegroundColor Green
  Write-Host '  Frontend: http://localhost:5173'
  if (-not $NoBackend) {
    Write-Host '  API:      http://localhost:8000/api'
    Write-Host '  API docs: http://localhost:8000/docs'
    Write-Host '  Postgres is not started; the UI uses dev localStorage and the in-memory /api.'
  } else {
    Write-Host '  Backend skipped; the UI uses dev localStorage.'
  }
  Write-Host 'Press Ctrl+C to stop.'
  Write-Host ''

  if ($Open) {
    Start-Process 'http://localhost:5173'
  }

  while (
    -not $frontendProcess.HasExited -and
    (-not $backendProcess -or -not $backendProcess.HasExited)
  ) {
    Start-Sleep -Milliseconds 500
  }
} finally {
  foreach ($process in @($frontendProcess, $backendProcess)) {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
