# AI Novel Video Generator - Windows Setup Script
# Usage: Right-click install.ps1 → "Run with PowerShell"
# Or double-click install.bat

param()

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Speeds up Invoke-WebRequest

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step($msg) {
    Write-Host "`n>> $msg" -ForegroundColor Cyan
}

function Write-Ok($msg) {
    Write-Host "   OK: $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "   !! $msg" -ForegroundColor Yellow
}

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
}

function Test-Command($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

# ─────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  AI Novel Video Generator - Setup"         -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# ── 1. Python ────────────────────────────────
Write-Step "Checking Python..."

$pythonCmd = $null
foreach ($cmd in @("python", "py", "python3")) {
    if (Test-Command $cmd) {
        $ver = & $cmd --version 2>&1
        if ($ver -match "3\.(9|10|11|12|13)") {
            $pythonCmd = $cmd
            Write-Ok "$ver"
            break
        }
    }
}

if (-not $pythonCmd) {
    Write-Warn "Python 3.9+ not found. Installing Python 3.11..."
    if (Test-Command "winget") {
        winget install --id Python.Python.3.11 -e --source winget `
            --accept-package-agreements --accept-source-agreements --silent
        Refresh-Path
    } else {
        Write-Warn "winget not available. Downloading Python installer..."
        $url = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
        $installer = "$env:TEMP\python_installer.exe"
        Invoke-WebRequest -Uri $url -OutFile $installer
        Start-Process $installer -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1" -Wait
        Remove-Item $installer -Force
        Refresh-Path
    }

    foreach ($cmd in @("python", "py", "python3")) {
        if (Test-Command $cmd) { $pythonCmd = $cmd; break }
    }

    if (-not $pythonCmd) {
        Write-Host "`n[ERROR] Python installation failed. Please install manually from https://python.org" -ForegroundColor Red
        exit 1
    }
    Write-Ok "Python installed: $(& $pythonCmd --version)"
}

# ── 2. Node.js ───────────────────────────────
Write-Step "Checking Node.js..."

if (Test-Command "node") {
    Write-Ok "Node.js $(node --version), npm $(npm --version)"
} else {
    Write-Warn "Node.js not found. Installing Node.js LTS..."
    if (Test-Command "winget") {
        winget install --id OpenJS.NodeJS.LTS -e --source winget `
            --accept-package-agreements --accept-source-agreements --silent
        Refresh-Path
    } else {
        Write-Warn "winget not available. Downloading Node.js installer..."
        $url = "https://nodejs.org/dist/v20.17.0/node-v20.17.0-x64.msi"
        $installer = "$env:TEMP\node_installer.msi"
        Invoke-WebRequest -Uri $url -OutFile $installer
        Start-Process msiexec -ArgumentList "/i `"$installer`" /quiet /norestart" -Wait
        Remove-Item $installer -Force
        Refresh-Path
    }

    if (-not (Test-Command "node")) {
        Write-Host "`n[ERROR] Node.js installation failed. Please install manually from https://nodejs.org" -ForegroundColor Red
        exit 1
    }
    Write-Ok "Node.js $(node --version) installed"
}

# ── 3. Python virtual environment ────────────
Write-Step "Setting up Python virtual environment..."

Set-Location $ROOT

if (-not (Test-Path ".venv")) {
    & $pythonCmd -m venv .venv
    Write-Ok "Virtual environment created at .venv\"
} else {
    Write-Ok "Virtual environment already exists"
}

$pip = Join-Path $ROOT ".venv\Scripts\pip.exe"
$venvPython = Join-Path $ROOT ".venv\Scripts\python.exe"

# ── 4. Python packages ────────────────────────
Write-Step "Installing Python packages..."

& $pip install --upgrade pip --quiet
& $pip install -r "backend\requirements.txt"

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[ERROR] pip install failed." -ForegroundColor Red
    exit 1
}
Write-Ok "Python packages installed"

# ── 5. Node packages ─────────────────────────
Write-Step "Installing Node.js packages..."

Set-Location "$ROOT\frontend"
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[ERROR] npm install failed." -ForegroundColor Red
    exit 1
}
Write-Ok "Node.js packages installed"

Set-Location $ROOT

# ── Done ──────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  To start the app, run:" -ForegroundColor White
Write-Host "    python start.py" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Or double-click: start.bat" -ForegroundColor White
Write-Host ""
