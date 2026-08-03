$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "未找到 Node.js，请先安装 Node.js 20 或更高版本。"
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw "未找到 pnpm，请先安装 pnpm 11。"
}

if (-not (Test-Path -LiteralPath ".env")) {
  Copy-Item -LiteralPath ".env.example" -Destination ".env"
  Write-Host "已创建 .env，请填写 ARK_API_KEY 后重新运行本脚本。"
  exit 1
}

if (-not (Test-Path -LiteralPath "node_modules")) {
  pnpm install --frozen-lockfile
}

pnpm dev
