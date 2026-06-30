# Dify 聊天助手 - HTTP 服务 (纯 PowerShell，无需安装任何东西)
Write-Host "=== 启动 HTTP 服务，端口 80 ===" -ForegroundColor Green
Write-Host "访问: http://$((Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike '*Loopback*' -and $_.PrefixOrigin -ne 'WellKnown'}).IPAddress)" -ForegroundColor Cyan

$folder = Join-Path $PSScriptRoot "dist"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:80/")
$listener.Start()

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "application/javascript"
    ".css"  = "text/css"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".ico"  = "image/x-icon"
    ".json" = "application/json"
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    $path = $request.Url.LocalPath

    if ($path -eq "/") { $path = "/index.html" }
    $filePath = Join-Path $folder $path.TrimStart("/")

    if (Test-Path $filePath -PathType Leaf) {
        $ext = [IO.Path]::GetExtension($filePath)
        $response.ContentType = if ($mimeTypes[$ext]) { $mimeTypes[$ext] } else { "application/octet-stream" }
        $buf = [IO.File]::ReadAllBytes($filePath)
        $response.ContentLength64 = $buf.Length
        $response.OutputStream.Write($buf, 0, $buf.Length)
    } else {
        $response.StatusCode = 404
        $buf = [Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.OutputStream.Write($buf, 0, $buf.Length)
    }
    $response.Close()
}
