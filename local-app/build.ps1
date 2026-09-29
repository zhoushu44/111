# build local-erp single-file exe (敏群商贸 ERP 本地版)
#
# 步骤：1) 构建前端(vite) → 2) 复制进 local-app\web 并内嵌 → 3) 编译 exe → 4) 输出到 ..\本地ERP版
# 用法：powershell -ExecutionPolicy Bypass -File .\build.ps1
#
# 注意：首行必须保持 ASCII；文件需以 UTF-8(BOM) 保存（本脚本内含中文路径字面量，
#       无 BOM 时 Windows PowerShell 会按 ANSI 解码导致路径乱码）。
$ErrorActionPreference = 'Stop'

$appDir  = $PSScriptRoot
$rootDir = Split-Path $appDir -Parent
$outDir  = Join-Path $rootDir '本地ERP版'
$webDir  = Join-Path $appDir 'web'

Write-Host '==> [1/4] build frontend (npx vite build)' -ForegroundColor Cyan
Push-Location $rootDir
try {
    & npx vite build
    if ($LASTEXITCODE -ne 0) { throw 'frontend build failed' }
} finally { Pop-Location }

Write-Host '==> [2/4] copy dist into local-app\web (embedded into exe)' -ForegroundColor Cyan
if (Test-Path $webDir) { Remove-Item $webDir -Recurse -Force }
New-Item -ItemType Directory -Path $webDir | Out-Null
Copy-Item (Join-Path $rootDir 'dist\*') $webDir -Recurse -Force

Write-Host '==> [3/4] compile exe' -ForegroundColor Cyan
Push-Location $appDir
try {
    & dotnet build (Join-Path $appDir 'MQLocalErp.csproj') -c Release --nologo
    if ($LASTEXITCODE -ne 0) { throw 'exe build failed' }
} finally { Pop-Location }

Write-Host '==> [4/4] publish to ..\本地ERP版' -ForegroundColor Cyan
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
Copy-Item (Join-Path $appDir 'bin\Release\MQLocalErp.exe') (Join-Path $outDir '敏群ERP本地版.exe') -Force
Copy-Item (Join-Path $appDir '使用说明.txt') $outDir -Force
$configOut = Join-Path $outDir 'config.json'
if (-not (Test-Path $configOut)) { Copy-Item (Join-Path $appDir 'config.default.json') $configOut -Force }
else { Write-Host '    (keep existing config.json)' -ForegroundColor Yellow }

Write-Host "done: $outDir" -ForegroundColor Green
Get-ChildItem $outDir | Select-Object Name, Length | Format-Table -AutoSize
