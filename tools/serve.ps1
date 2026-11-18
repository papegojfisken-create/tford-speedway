# Tiny static file server for local testing. Usage: powershell -File tools\serve.ps1 -Root <folder> -Port 8765
# Also accepts POST /__save?name=file.jpg and writes the body into -ShotDir, so a test page can save screenshots for review.
param([string]$Root = (Join-Path $PSScriptRoot '..'), [int]$Port = 8765, [string]$ShotDir = 'C:\Users\Papeg\AppData\Local\Temp\claude\1b0b6fb2d9d1c9df\deeeaf69-beb1-41e4-b667-c8fbb8e3c78d\scratchpad\shots')
$Root = (Resolve-Path $Root).Path
New-Item -ItemType Directory -Force $ShotDir | Out-Null
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
            '.json'='application/json'; '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml'; '.ico'='image/x-icon' }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root at http://localhost:$Port/"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($ctx.Request.HttpMethod -eq 'POST' -and $rel -eq '__save') {
        $name = $ctx.Request.QueryString['name']
        if ($name -match '^[A-Za-z0-9_.-]{1,60}$') {
          $ms = New-Object IO.MemoryStream
          $ctx.Request.InputStream.CopyTo($ms)
          [IO.File]::WriteAllBytes((Join-Path $ShotDir $name), $ms.ToArray())
          $ctx.Response.StatusCode = 200
        } else { $ctx.Response.StatusCode = 400 }
        $ctx.Response.Headers.Add('Cache-Control', 'no-store')
        Write-Host "$($ctx.Response.StatusCode) POST /__save $name"
      } else {
        if ($rel -eq '') { $rel = 'index.html' }
        $path = [IO.Path]::GetFullPath((Join-Path $Root $rel))
        if ($path.StartsWith($Root) -and (Test-Path $path -PathType Leaf)) {
          $bytes = [IO.File]::ReadAllBytes($path)
          $ext = [IO.Path]::GetExtension($path).ToLower()
          if ($types.ContainsKey($ext)) { $ctx.Response.ContentType = $types[$ext] } else { $ctx.Response.ContentType = 'application/octet-stream' }
          $ctx.Response.Headers.Add('Cache-Control', 'no-store')
          $ctx.Response.ContentLength64 = $bytes.Length
          if ($ctx.Request.HttpMethod -ne 'HEAD') { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
        } else {
          $ctx.Response.StatusCode = 404
        }
        Write-Host "$($ctx.Response.StatusCode) /$rel"
      }
    } catch { Write-Host "request failed: $_" }
    try { $ctx.Response.Close() } catch {}
  }
} finally { $listener.Stop() }
