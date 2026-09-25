# 编译打印代理（.NET Framework 3.5 / CLR2），产物可运行于 Windows XP / 7 / 10 / 11。
#
# 前置条件：任意较新的 .NET SDK（提供 dotnet 命令）。
# 参考程序集由 NuGet 包 Microsoft.NETFramework.ReferenceAssemblies 自动还原，
# 本机无需安装 .NET 3.5 目标包。
#
# 用法：在 powershell 中执行  .\build.ps1
$ErrorActionPreference = 'Stop'

$buildDir = $PSScriptRoot
$toolsDir = Join-Path (Split-Path $buildDir -Parent) 'tools'
$outDir   = Join-Path $buildDir 'bin\Release'

foreach ($name in @('MQPrintAgent', 'labelrender', 'rawprint')) {
    Write-Host "==> 编译 $name" -ForegroundColor Cyan
    dotnet build (Join-Path $buildDir "$name.csproj") -c Release --nologo
    if ($LASTEXITCODE -ne 0) { throw "$name 编译失败" }
}

foreach ($file in @(
    'MQPrintAgent.exe',     'MQPrintAgent.exe.config',
    'labelrender.exe',      'labelrender.exe.config',
    'rawprint.exe',         'rawprint.exe.config')) {
    Copy-Item (Join-Path $outDir $file) $toolsDir -Force
}

Write-Host "已更新 $toolsDir 下的 exe 与 exe.config" -ForegroundColor Green
