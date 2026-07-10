$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "SmailBox - Khoi dong he thong"

function Write-Title {
  Write-Host ""
  Write-Host " ============================================================"
  Write-Host "             SMAILBOX - KHOI DONG TU DONG"
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

function Find-FreePort([int]$StartPort) {
  for ($port = $StartPort; $port -le 3999; $port++) {
    $used = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if (-not $used) { return $port }
  }
  throw "Khong tim thay port trong tu 3000 den 3999."
}

try {
  Write-Title

  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Chua cai Node.js. Tai Node.js LTS tai: https://nodejs.org/"
  }
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "Khong tim thay npm.cmd. Hay cai lai Node.js LTS va chon Add to PATH."
  }

  Write-Host "[0/6] Dang dung SmailBox cu neu dang chay..."
  Get-CimInstance Win32_Process |
    Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -and $_.CommandLine -like "*server*dist*index.js*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  Remove-Item -Path "node_modules\.prisma\client\query_engine-windows.dll.node.tmp*" -Force -ErrorAction SilentlyContinue

  if (-not (Test-Path -LiteralPath ".env")) {
    Write-Host "[1/6] Dang tao file .env..."
    Copy-Item -LiteralPath ".env.example" -Destination ".env" -Force
  } else {
    Write-Host "[1/6] Cau hinh da san sang."
  }

  $script:EnvContent = Get-Content -Raw -LiteralPath ".env"
  if ($script:EnvContent -match "replace_with_at_least_32_random_characters") {
    $script:EnvContent = $script:EnvContent.Replace("replace_with_at_least_32_random_characters", (New-HexSecret 48))
  }
  if ($script:EnvContent -match "replace_with_64_hex_characters") {
    $script:EnvContent = $script:EnvContent.Replace("replace_with_64_hex_characters", (New-HexSecret 32))
  }
  Set-EnvLine "DB_CONNECTION_STRING" "file:./smailpro.db"
  Set-Content -LiteralPath ".env" -Value $script:EnvContent -Encoding UTF8

  if (-not (Test-Path -LiteralPath "server\prisma\smailpro.db")) {
    New-Item -ItemType File -Path "server\prisma\smailpro.db" -Force | Out-Null
  }

  if (-not (Test-Path -LiteralPath "node_modules")) {
    Write-Host "[2/6] Dang cai thu vien. Lan dau co the mat vai phut..."
  } else {
    Write-Host "[2/6] Dang kiem tra va cap nhat thu vien..."
  }
  Invoke-Tool "npm.cmd" @("install") "Khong the cai dependencies. Kiem tra ket noi Internet."

  Write-Host "[3/6] Dang tao Prisma client..."
  & npm.cmd run db:generate
  if ($LASTEXITCODE -ne 0 -and -not (Test-Path -LiteralPath "node_modules\.prisma\client\index.js")) {
    throw "Khong the tao Prisma client."
  }

  Write-Host "[4/6] Dang cap nhat database..."
  Invoke-Tool "npm.cmd" @("run", "db:deploy") "Khong the tao hoac cap nhat database SQLite."

  Write-Host "[5/6] Dang build ung dung..."
  Invoke-Tool "npm.cmd" @("run", "build") "Build ung dung that bai."

  $configuredPort = 3000
  $portLine = Select-String -Path ".env" -Pattern "^PORT=(.+)$" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($portLine -and [int]::TryParse($portLine.Matches[0].Groups[1].Value, [ref]$configuredPort)) {
    $configuredPort = [int]$portLine.Matches[0].Groups[1].Value
  }
  $freePort = Find-FreePort $configuredPort
  $env:NODE_ENV = "production"
  $env:PORT = [string]$freePort
  $appUrl = "http://localhost:$freePort"

  Write-Host "[6/6] Dang khoi dong SmailBox..."
  Write-Host ""
  Write-Host " ============================================================"
  Write-Host "  Dia chi: $appUrl"
  Write-Host "  Khong dong cua so nay khi dang su dung."
  Write-Host "  Nhan Ctrl+C de dung server."
  Write-Host " ============================================================"
  Write-Host ""

  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", "Start-Sleep -Seconds 3; Start-Process '$appUrl'"
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
