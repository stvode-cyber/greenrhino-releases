# publish.ps1 — 绿角犀播放器 Windows 客户端发布脚本
# 先决条件：已安装 .NET 8 SDK（https://dotnet.microsoft.com/download）
# 用法（PowerShell）： .\publish.ps1

$ErrorActionPreference = "Stop"

# 确保 dotnet 可用（greenrhino-tools 专用路径兜底）
$dotnetPath = "C:\greenrhino-tools\dotnet\dotnet.exe"
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue) -and (Test-Path $dotnetPath)) {
    $env:Path = "C:\greenrhino-tools\dotnet;" + $env:Path
}

Write-Host "1) 复制 web 应用到 wwwroot ..." -ForegroundColor Cyan
Push-Location $PSScriptRoot\..\..
node clients\copy-web.mjs
Pop-Location

Write-Host "2) 生成图标资源 ..." -ForegroundColor Cyan
Push-Location $PSScriptRoot\..\..
node clients\build-assets.mjs
Pop-Location

Write-Host "3) 自包含发布（无需用户安装 .NET）..." -ForegroundColor Cyan
dotnet publish "$PSScriptRoot\GreenRhinoPlayer.csproj" -c Release -r win-x64 `
  --self-contained true -p:PublishSingleFile=true -o "$PSScriptRoot\publish"

Write-Host "`n✅ 完成。可执行文件位于: $PSScriptRoot\publish\GreenRhinoPlayer.exe" -ForegroundColor Green
