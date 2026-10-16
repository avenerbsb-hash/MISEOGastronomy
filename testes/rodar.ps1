# Equivalente Windows de testes/rodar.sh: sobe um Postgres 16 descartavel, aplica as
# migracoes e roda os mesmos testes. Uso (na raiz do repositorio):
#   powershell -ExecutionPolicy Bypass -File testes\rodar.ps1
# Requer o PostgreSQL 16 instalado (padrao: C:\Program Files\PostgreSQL\16\bin).
param(
  [string]$PgBin = 'C:\Program Files\PostgreSQL\16\bin',
  [int]$Porta = 54329
)
$ErrorActionPreference = 'Continue'   # avisos do psql chegam pelo stderr; falhas sao vistas pelo codigo de saida
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$env:PGCLIENTENCODING = 'UTF8'
if (-not (Test-Path "$PgBin\initdb.exe")) { Write-Error "PostgreSQL nao encontrado em $PgBin (use -PgBin)"; exit 1 }

Set-Location (Split-Path $PSScriptRoot -Parent)
$data = Join-Path $env:TEMP ('miseo-pg-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
& "$PgBin\initdb.exe" -D $data -U postgres -A trust -E UTF8 --locale=C | Out-Null
# pg_ctl com saida redirecionada trava no Windows (o servidor herda o pipe): sobe solto e espera com pg_isready
Start-Process -FilePath "$PgBin\pg_ctl.exe" -WindowStyle Hidden `
  -ArgumentList @('-D', "`"$data`"", '-o', "`"-p $Porta`"", '-l', "`"$data\log`"", 'start')
$pronto = $false
for ($i = 0; $i -lt 60 -and -not $pronto; $i++) {
  Start-Sleep -Milliseconds 500
  & "$PgBin\pg_isready.exe" -h localhost -p $Porta -q
  $pronto = ($LASTEXITCODE -eq 0)
}

$saida = New-Object System.Collections.Generic.List[string]
$falhou = -not $pronto
try {
  if (-not $pronto) { throw "Postgres nao subiu; veja $data\log" }
  function P([string]$db, [string]$arquivo, [switch]$Silencioso) {
    $out = & "$PgBin\psql.exe" -h localhost -p $Porta -U postgres -v ON_ERROR_STOP=1 -q -d $db -f $arquivo 2>&1 |
           ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) {
      $script:falhou = $true
      $out | Select-Object -Last 8 | ForEach-Object { $saida.Add($_); $_ }
      throw "psql falhou em $arquivo"
    }
    if (-not $Silencioso) {
      $out | Where-Object { $_ -match 'OK  |^==|ERRO|ERROR|FALHOU' } |
             ForEach-Object { $_ -replace '^psql:\S+ (NOTICE|AVISO):  ', '' } |
             ForEach-Object { $saida.Add($_); $_ }
    }
  }
  foreach ($db in 'aceite', 'seed', 'medicao') {
    & "$PgBin\psql.exe" -h localhost -p $Porta -U postgres -q -d postgres -c "create database $db" | Out-Null
    P $db 'testes/00_stub_supabase.sql' -Silencioso
    Get-ChildItem 'supabase/migrations/*.sql' | Sort-Object Name |
      ForEach-Object { P $db ('supabase/migrations/' + $_.Name) -Silencioso }
  }
  P aceite  'testes/10_casos_de_aceite.sql'
  P aceite  'testes/40_cmv_referencia.sql'
  P aceite  'testes/50_correcoes_0005.sql'
  P aceite  'testes/60_correcoes_0006.sql'
  P aceite  'testes/80_variacao_fichas.sql'
  P seed    'supabase/seed/01_insumos_giuli.sql'
  P seed    'testes/20_seed_giuli.sql'
  P seed    'supabase/seed/03_categorias.sql' -Silencioso
  P seed    'supabase/seed/03_categorias.sql' -Silencioso
  P seed    'testes/70_categorias.sql'
  P medicao 'supabase/seed/01_insumos_giuli.sql'
  P medicao 'supabase/seed/02_regras_de_medicao.sql' -Silencioso
  P medicao 'testes/30_recebimento.sql'
} catch {
  $falhou = $true
  Write-Host "!! $_"
} finally {
  & "$PgBin\pg_ctl.exe" -D $data stop -m fast 2>&1 | Out-Null
  Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue
}

# Mesma conferencia do GitHub Actions (regex sem acento para nao depender da codificacao do arquivo)
$esperadas = 'TODOS OS TESTES PASSARAM', 'CMV DE REFER.NCIA OK', 'CORRE..ES 0005 OK', 'CORRE..ES 0006 OK',
             'SEED OK', 'CATEGORIAS OK', 'RECEBIMENTO OK', 'VARIA..O FICHAS OK'
foreach ($m in $esperadas) {
  if (-not ($saida | Where-Object { $_ -match $m })) { Write-Host "!! Faltou: $m"; $falhou = $true }
}
if ($falhou) { Write-Host '!! TESTES FALHARAM'; exit 1 }
Write-Host '== TUDO OK'
exit 0
