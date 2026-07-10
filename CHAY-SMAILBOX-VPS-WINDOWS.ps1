$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdmin) {
  Write-Host ""
  Write-Host " ============================================================"
  Write-Host "             SMAILBOX VPS - CAN QUYEN ADMIN"
  Write-Host " ============================================================"
  Write-Host ""
  Write-Host "Script se xin quyen Administrator de mo Windows Firewall."
  Write-Host "Vui long bam Yes o cua so UAC, sau do script se tu chay tiep."
  Start-Process powershell.exe -Verb RunAs -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`""
  )
  exit 0
}

Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "SmailBox VPS - Chay public tren Windows"

function Write-Title {
  Write-Host ""
  Write-Host " ============================================================"
  Write-Host "         SMAILBOX VPS WINDOWS - CHAY BANG MOT CU CLICK"
  Write-Host " ============================================================"
  Write-Host ""
}

function New-HexSecret([int]$Bytes) {
  $buffer = [byte[]]::new($Bytes)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return ([Convert]::ToHexString($buffer)).ToLowerInvariant()
}

function Set-EnvLine([string]$Name, [string]$Value) {
  $script:EnvContent = if ($script:EnvContent -match "(?m)^$([regex]::Escape($Name))=") {
    [regex]::Replace($script:EnvContent, "(?m)^$([regex]::Escape($Name))=.*$", "$Name=$Value")
  } else {
    $script:EnvContent.TrimEnd() + [Environment]::NewLine + "$Name=$Value" + [Environment]::NewLine
  }
}

function Invoke-Tool([string]$File, [string[]]$Arguments, [string]$ErrorMessage) {
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw $ErrorMessage
  }
}

function Get-PublicIp {
  try {
    $ip = Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 5
    if ($ip) { return $ip.Trim() }
  } catch {
    return "IP_VPS_CUA_BAN"
  }
  return "IP_VPS_CUA_BAN"
}

try {
  Write-Title

  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Chua cai Node.js. Tai Node.js LTS tai: https://nodejs.org/"
  }
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "Khong tim thay npm.cmd. Hay cai lai Node.js LTS va chon Add to PATH."
  }

  Write-Host "[0/7] Dang dung SmailBox cu neu dang chay..."
  Get-CimInstance Win32_Process |
    Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -and $_.CommandLine -like "*server*dist*index.js*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  Remove-Item -Path "node_modules\.prisma\client\query_engine-windows.dll.node.tmp*" -Force -ErrorAction SilentlyContinue

  if (-not (Test-Path -LiteralPath ".env")) {
    Write-Host "[1/7] Dang tao file .env..."
    Copy-Item -LiteralPath ".env.example" -Destination ".env" -Force
  } else {
    Write-Host "[1/7] Dang kiem tra file .env..."
  }

  Write-Host "[2/7] Dang cau hinh production public..."
  $script:EnvContent = Get-Content -Raw -LiteralPath ".env"
  if ($script:EnvContent -match "replace_with_at_least_32_random_characters") {
    $script:EnvContent = $script:EnvContent.Replace("replace_with_at_least_32_random_characters", (New-HexSecret 48))
  }
  if ($script:EnvContent -match "replace_with_64_hex_characters") {
    $script:EnvContent = $script:EnvContent.Replace("replace_with_64_hex_characters", (New-HexSecret 32))
  }
  Set-EnvLine "HOST" "0.0.0.0"
  Set-EnvLine "PORT" "3000"
  Set-EnvLine "NODE_ENV" "production"
  Set-EnvLine "CLIENT_ORIGIN" "http://localhost:3000"
  Set-EnvLine "DB_CONNECTION_STRING" "file:./smailpro.db"
  Set-EnvLine "TRUST_PROXY" "false"
  Set-EnvLine "COOKIE_SECURE" "false"
  Set-Content -LiteralPath ".env" -Value $script:EnvContent -Encoding UTF8

  if (-not (Test-Path -LiteralPath "server\prisma\smailpro.db")) {
    New-Item -ItemType File -Path "server\prisma\smailpro.db" -Force | Out-Null
  }

  $appPort = 3000
  Write-Host "[3/7] Dang mo Windows Firewall cho port $appPort..."
  Remove-NetFirewallRule -DisplayName "SmailBox $appPort" -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName "SmailBox $appPort" -Direction Inbound -Protocol TCP -LocalPort $appPort -Action Allow | Out-Null

  if (-not (Test-Path -LiteralPath "node_modules")) {
    Write-Host "[4/7] Dang cai thu vien. Lan dau co the mat vai phut..."
  } else {
    Write-Host "[4/7] Dang kiem tra va cap nhat thu vien..."
  }
  Invoke-Tool "npm.cmd" @("install") "Khong the cai dependencies. Kiem tra ket noi Internet."

  Write-Host "[5/7] Dang cap nhat database..."
  & npm.cmd run db:generate
  if ($LASTEXITCODE -ne 0 -and -not (Test-Path -LiteralPath "node_modules\.prisma\client\index.js")) {
    throw "Khong the tao Prisma client."
  }
  Invoke-Tool "npm.cmd" @("run", "db:deploy") "Khong the tao hoac cap nhat database SQLite."

  Write-Host "[6/7] Dang build ung dung..."
  Invoke-Tool "npm.cmd" @("run", "build") "Build ung dung that bai."

  $env:NODE_ENV = "production"
  $env:HOST = "0.0.0.0"
  $env:PORT = [string]$appPort
  $publicIp = Get-PublicIp
  $publicUrl = "http://$publicIp`:$appPort"

  Write-Host "[7/7] Dang khoi dong SmailBox public..."
  Write-Host ""
  Write-Host " ============================================================"
  Write-Host "  Truy cap tu may ngoai: $publicUrl"
  Write-Host "  Truy cap tren VPS:     http://localhost:$appPort"
  Write-Host ""
  Write-Host "  Neu may ngoai chua vao duoc, hay mo them port $appPort"
  Write-Host "  trong firewall/security group cua nha cung cap VPS."
  Write-Host ""
  Write-Host "  Khong dong cua so nay khi dang su dung."
  Write-Host "  Nhan Ctrl+C de dung server."
  Write-Host " ============================================================"
  Write-Host ""

  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", "Start-Sleep -Seconds 3; Start-Process 'http://localhost:$appPort'"
  )

  & node.exe "server\dist\index.js"
  exit $LASTEXITCODE
} catch {
  Write-Host ""
  Write-Host "[LOI] $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ""
  Read-Host "Nhan Enter de dong cua so"
  exit 1
}
