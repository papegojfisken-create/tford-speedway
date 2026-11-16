# Builds artifact.html from index.html: the same page body, in the shape a Claude artifact needs
# (no doctype/html/head/body tags of its own). Run this after changing index.html, then publish again.
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$text = [IO.File]::ReadAllText((Join-Path $root 'index.html'), [Text.Encoding]::UTF8)
$start = $text.IndexOf('<body>') + 6
$end = $text.IndexOf('</body>')
$body = $text.Substring($start, $end - $start).Trim()
$head = @'
<title>T-Ford Speedway</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="style.css">
<style>:root{color-scheme:dark}</style>
'@
[IO.File]::WriteAllText((Join-Path $root 'artifact.html'), $head + "`n" + $body + "`n", (New-Object Text.UTF8Encoding($false)))
Write-Host "artifact.html written ($($body.Length) characters of body)"
