# Build print agent (.NET Framework 4.8), runs on Win10 1803+ / Win11.
# Win10/11 ships with .NET 4.8 runtime, no extra install needed, true single exe.
#
# Prerequisite: any modern .NET SDK (provides dotnet command).
# Reference assemblies via NuGet Microsoft.NETFramework.ReferenceAssemblies.
#
# Usage:  .\build.ps1
$ErrorActionPreference = 'Stop'

$buildDir = $PSScriptRoot
$toolsDir = Join-Path (Split-Path $buildDir -Parent) 'tools'
$outDir   = Join-Path $buildDir 'bin\Release'

foreach ($name in @('MQPrintAgent', 'labelrender', 'rawprint')) {
    Write-Host "==> build $name" -ForegroundColor Cyan
    dotnet build (Join-Path $buildDir "$name.csproj") -c Release --nologo
    if ($LASTEXITCODE -ne 0) { throw "$name build failed" }
}

# net48 does not generate .exe.config, only copy exe
foreach ($file in @('MQPrintAgent.exe', 'labelrender.exe', 'rawprint.exe')) {
    Copy-Item (Join-Path $outDir $file) $toolsDir -Force
}

# Clean up old .exe.config files from net35 era
foreach ($cfg in @('MQPrintAgent.exe.config', 'labelrender.exe.config', 'rawprint.exe.config')) {
    $old = Join-Path $toolsDir $cfg
    if (Test-Path $old) { Remove-Item $old -Force; Write-Host "cleaned $cfg" -ForegroundColor Yellow }
}

Write-Host "done: updated exe in $toolsDir (single file, no .exe.config)" -ForegroundColor Green
