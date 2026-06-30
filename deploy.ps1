# Dify 聊天助手 - 一键部署脚本 (Windows ECS)
# 在 ECS 服务器上以管理员身份运行此脚本

Write-Host "=== Dify AI 部署脚本 ===" -ForegroundColor Cyan

# 1. 安装 Node.js (如果没有)
Write-Host "`n[1/3] 检查 Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "正在安装 Node.js..." -ForegroundColor Green
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.11.0/node-v22.11.0-win-x64.msi" -OutFile "$env:TEMP\node.msi"
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$env:TEMP\node.msi`" /quiet /norestart"
    Remove-Item "$env:TEMP\node.msi"
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine")
    Write-Host "Node.js 安装完成: $(node --version)" -ForegroundColor Green
} else {
    Write-Host "Node.js 已安装: $nodeVersion" -ForegroundColor Green
}

# 2. 创建项目目录并拉取代码
Write-Host "`n[2/3] 拉取项目代码..." -ForegroundColor Yellow
$projectPath = "C:\chatbot"
if (-not (Test-Path $projectPath)) {
    New-Item -ItemType Directory -Path $projectPath -Force | Out-Null
}
Set-Location $projectPath

# 从 GitHub 克隆
if (Test-Path "$projectPath\.git") {
    git pull origin main 2>$null
} else {
    git clone https://github.com/xrt202563/PaperSearch.git $projectPath 2>$null
}
if (-not (Test-Path "$projectPath\package.json")) {
    Write-Host "Git 不可用，手动下载项目..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://github.com/xrt202563/PaperSearch/archive/refs/heads/main.zip" -OutFile "$env:TEMP\PaperSearch.zip"
    Expand-Archive -Path "$env:TEMP\PaperSearch.zip" -DestinationPath "$env:TEMP\PaperSearch" -Force
    Copy-Item -Path "$env:TEMP\PaperSearch\PaperSearch-main\*" -Destination $projectPath -Recurse -Force
    Remove-Item "$env:TEMP\PaperSearch.zip" -Recurse -Force
    Remove-Item "$env:TEMP\PaperSearch" -Recurse -Force
}

# 3. 安装依赖并构建
Write-Host "`n[3/3] 安装依赖并启动..." -ForegroundColor Yellow
npm install
npm run build

# 4. 安装 serve 并启动
Write-Host "`n安装 serve 并启动 HTTP 服务..." -ForegroundColor Cyan
npx serve dist -l 80 --no-clipboard

Write-Host "`n=== 部署完成! 访问 http://39.96.82.148 ===" -ForegroundColor Green
