$ErrorActionPreference = 'Stop'

function Write-Info($Message) { Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-Ok($Message) { Write-Host "[OK]   $Message" -ForegroundColor Green }
function Write-Warn($Message) { Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Fail($Message) { Write-Host "[ERR]  $Message" -ForegroundColor Red; exit 1 }

Set-Location $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'Docker não foi encontrado. Instale e inicie o Docker Desktop.' }
if (-not (Test-Path 'docker-compose.yml')) { Fail 'docker-compose.yml não encontrado na raiz do projeto.' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail 'O Docker Desktop não está em execução.' }
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker Compose não está disponível.' }

function New-HexSecret([int]$Bytes) {
  $Buffer = New-Object byte[] $Bytes
  $Random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $Random.GetBytes($Buffer) } finally { $Random.Dispose() }
  return ([BitConverter]::ToString($Buffer) -replace '-', '').ToLowerInvariant()
}

function Get-EnvValue($Name) {
  if (-not (Test-Path '.env')) { return $null }
  $Line = Get-Content '.env' | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
  if ($null -eq $Line) { return $null }
  return ($Line -replace "^$([regex]::Escape($Name))=", '')
}

function Set-EnvValue($Name, $Value) {
  $Lines = if (Test-Path '.env') { @(Get-Content '.env') } else { @() }
  $Pattern = "^$([regex]::Escape($Name))="
  $Found = $false
  $Lines = @($Lines | ForEach-Object {
    if ($_ -match $Pattern) { $Found = $true; "$Name=$Value" } else { $_ }
  })
  if (-not $Found) { $Lines += "$Name=$Value" }
  Set-Content -Path '.env' -Value $Lines -Encoding utf8
}

function Ensure-Generated($Name, [int]$Bytes) {
  $Current = Get-EnvValue $Name
  if ([string]::IsNullOrWhiteSpace($Current) -or $Current -eq 'CHANGE_ME') {
    Set-EnvValue $Name (New-HexSecret $Bytes)
    Write-Ok "$Name gerado."
  }
}

Write-Host "`nLevicord - setup Docker para Windows`n" -ForegroundColor White
if (-not (Test-Path '.env')) {
  Set-Content '.env' '# Gerado por setup.ps1. Não commitar este arquivo.' -Encoding utf8
  Write-Ok '.env criado.'
}

Ensure-Generated 'POSTGRES_PASSWORD' 24
Ensure-Generated 'JWT_SECRET' 64
Ensure-Generated 'DATABASE_ENCRYPTION_KEY' 32
Ensure-Generated 'MINIO_ACCESS_KEY' 16
Ensure-Generated 'MINIO_SECRET_KEY' 32
Ensure-Generated 'GRAFANA_PASSWORD' 24

function Request-EnvValue($Name, $Prompt, $Default = $null) {
  $Current = Get-EnvValue $Name
  if (-not [string]::IsNullOrWhiteSpace($Current) -and $Current -ne 'CHANGE_ME') { return }
  $Suffix = if ($null -eq $Default) { '' } else { " [$Default]" }
  do { $Value = Read-Host "$Prompt$Suffix"; if ([string]::IsNullOrWhiteSpace($Value)) { $Value = $Default } } while ([string]::IsNullOrWhiteSpace($Value))
  Set-EnvValue $Name $Value
}

Request-EnvValue 'DOMAIN' 'Domínio público' 'levicord.uk'
Request-EnvValue 'GOOGLE_CLIENT_ID' 'Google OAuth Client ID'
Request-EnvValue 'GOOGLE_CLIENT_SECRET' 'Google OAuth Client Secret'
Request-EnvValue 'ADMIN_EMAILS' 'Emails dos administradores separados por vírgula'
Request-EnvValue 'CLOUDFLARED_TOKEN' 'Token do Cloudflare Tunnel'

Write-Info 'Construindo imagens e iniciando os serviços...'
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Fail 'O Docker Compose não conseguiu iniciar os serviços. Veja: docker compose logs' }

function Wait-Healthy($Service, [int]$MaxAttempts) {
  Write-Info "Aguardando $Service ficar healthy..."
  for ($Attempt = 0; $Attempt -lt $MaxAttempts; $Attempt++) {
    $Container = docker compose ps -q $Service 2>$null
    if ($Container) {
      $Status = docker inspect --format '{{.State.Health.Status}}' $Container 2>$null
      if ($Status -eq 'healthy') { Write-Ok "$Service está healthy."; return }
    }
    Start-Sleep -Seconds 2
  }
  Write-Warn "$Service não ficou healthy. Verifique: docker compose logs $Service"
}

Wait-Healthy 'postgres' 40
Wait-Healthy 'redis' 40
Wait-Healthy 'minio' 40

Write-Info 'Aplicando migrations do Prisma...'
if (Test-Path 'apps/server/prisma/migrations') {
  docker compose exec -T server pnpm exec prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { Fail 'As migrations falharam. Verifique: docker compose logs server' }
} else {
  Write-Warn 'Nenhuma migration versionada foi encontrada; sincronizando o schema com prisma db push.'
  docker compose exec -T server pnpm exec prisma db push --skip-generate
  if ($LASTEXITCODE -ne 0) {
    Fail 'O banco já possui dados incompatíveis com o schema atual. Faça um backup e crie um baseline Prisma; não use --force-reset sem confirmar que pode apagar os dados.'
  }
}

Write-Host "`nSetup concluído.`n" -ForegroundColor Green
docker compose ps
Write-Host "`nApp:       https://$(Get-EnvValue 'DOMAIN')"
Write-Host 'API docs:  http://localhost:3000/api/docs'
Write-Host 'MinIO:     http://localhost:9001'
Write-Host 'Prometheus http://localhost:9090'
Write-Host 'Grafana:   http://localhost:3001'