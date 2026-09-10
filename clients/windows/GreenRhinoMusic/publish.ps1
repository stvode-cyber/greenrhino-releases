# publish.ps1 — 绿角犀播放器 Windows 客户端发布脚本
# 先决条件：已安装 .NET 8 SDK（https://dotnet.microsoft.com/download）
# 用法（PowerShell）： .\publish.ps1

$ErrorActionPreference = "Stop"

Write-Host "1) 复制 web 应用到 wwwroot ..." -ForegroundColor Cyan
Push-Location $PSScriptRoot\..\..
node clients\copy-web.mjs
Pop-Location

Write-Host "2) 生成图标资源 ..." -ForegroundColor Cyan
Push-Location $PSScriptRoot\..\..
node clients\build-assets.mjs
Pop-Location

Write-Host "3) 自包含发布（无需用户安装 .NET）..." -ForegroundColor Cyan
dotnet publish "$PSScriptRoot\GreenRhino.csproj" -c Release -r win-x64 `
  --self-contained true -p:PublishSingleFile=true -o "$PSScriptRoot\publish"

Write-Host "`n✅ 完成。可执行文件位于: $PSScriptRoot\publish\GreenRhino.exe" -ForegroundColor Green
Write-Host "提示：若要生成 MSIX 安装包，请用 Visual Studio 的『Windows 应用程序打包项目』" -ForegroundColor Yellow
Write-Host "      引用 GreenRhino 工程，并将 publish 目录作为『应用程序』内容；详见 clients/README.md。" -ForegroundColor Yellow
