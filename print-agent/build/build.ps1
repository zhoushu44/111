# 编译打印代理（.NET Framework 3.5 / CLR2），产物可运行于 Windows XP / 7 / 10 / 11。
#
# 前置条件：任意较新的 .NET SDK（提供 dotnet 命令）。
# 参考程序集由 NuGet 包 Microsoft.NETFramework.ReferenceAssemblies 自动还原，
# 本机无需安装 .NET 3.5 目标包。
#
# 用法：在 powershell 中执行  .\build.ps1
# 产物：1) 更新 ..\tools\ 下的 exe 与 exe.config
#       2) 生成 ..\dist\MQPrintAgent-<版本>.zip 免安装分发包（含全部依赖文件）
$ErrorActionPreference = 'Stop'

$buildDir = $PSScriptRoot
$agentDir = Split-Path $buildDir -Parent
$toolsDir = Join-Path $agentDir 'tools'
$outDir   = Join-Path $buildDir 'bin\Release'

foreach ($name in @('MQPrintAgent', 'labelrender', 'rawprint')) {
    Write-Host "==> 编译 $name" -ForegroundColor Cyan
    dotnet build (Join-Path $buildDir "$name.csproj") -c Release --nologo
    if ($LASTEXITCODE -ne 0) { throw "$name 编译失败" }
}

# 运行时需要的全部文件（缺一不可：.exe.config 声明 CLR 版本回退，缺失时 Win10/11 会弹「必须先安装 .NET Framework v4.0.30319」）
$runtimeFiles = @(
    'MQPrintAgent.exe',     'MQPrintAgent.exe.config',
    'labelrender.exe',      'labelrender.exe.config',
    'rawprint.exe',         'rawprint.exe.config',
    '使用说明.txt')

foreach ($file in $runtimeFiles) {
    $src = Join-Path $outDir $file
    if (-not (Test-Path $src)) { $src = Join-Path $toolsDir $file }   # 说明文档等非编译产物直接取自 tools
    if ($src -ne (Join-Path $toolsDir $file)) { Copy-Item $src $toolsDir -Force }
}

Write-Host "已更新 $toolsDir 下的 exe 与 exe.config" -ForegroundColor Green

# ---- 打免安装分发包：把运行时需要的全部文件放进一个 zip，分发时整包拷走即可，避免漏拷 ----
$distDir = Join-Path $agentDir 'dist'
$stageDir = Join-Path $distDir 'MQPrintAgent'
if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
New-Item $stageDir -ItemType Directory -Force | Out-Null

foreach ($file in $runtimeFiles) {
    Copy-Item (Join-Path $toolsDir $file) $stageDir -Force
}

$version = Get-Date -Format 'yyyyMMdd'
$zipPath = Join-Path $distDir "MQPrintAgent-$version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -Force
Remove-Item $stageDir -Recurse -Force

Write-Host "已生成分发包 $zipPath（$((Get-Item $zipPath).Length / 1KB -as [int]) KB）" -ForegroundColor Green
