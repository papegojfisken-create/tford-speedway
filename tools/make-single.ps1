# Builds T-Ford-Speedway.html: the whole game in ONE file (styles, 3D library and game code inside it).
# Easy to send to someone: they just open the file in their browser. Run again after changing the game.
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$utf8 = New-Object Text.UTF8Encoding($false)
function ReadText($rel) { [IO.File]::ReadAllText((Join-Path $root $rel), [Text.Encoding]::UTF8) }

$html = ReadText 'index.html'
$css = ReadText 'style.css'
$files = 'js/lib/three.min.js', 'js/spadata.js', 'js/track.js', 'js/physics.js', 'js/world.js', 'js/tford.js', 'js/gt3.js', 'js/p963data.js', 'js/lmp1.js', 'js/effects.js', 'js/audio.js', 'js/net.js', 'js/account.js', 'js/game.js'
# what boot.js normally sets up before the game files load
$js = "window.TF = window.TF || {}; window.TF.fatal = function (m) { var f = document.getElementById('fatal'); f.textContent = m; f.hidden = false; };`n"
foreach ($f in $files) {
  $t = ReadText $f
  if ($t -match '(?i)</script') { throw "$f contains a closing script tag and cannot be inlined as is" }
  $js += "`n/* ---- $f ---- */`n" + $t + "`n"
}
$html = $html.Replace('<link rel="stylesheet" href="style.css">', "<style>`n$css`n</style>")
$html = $html.Replace('<script src="js/boot.js"></script>', "<script>`n$js`n</script>")
if ($html.Contains('js/boot.js') -or $html.Contains('href="style.css"')) { throw 'index.html did not have the expected link/script tags' }
$out = Join-Path $root 'T-Ford-Speedway.html'
[IO.File]::WriteAllText($out, $html, $utf8)
# the same file again as web\index.html: a folder ready to drop onto a web host
$web = Join-Path $root 'web'
New-Item -ItemType Directory -Force $web | Out-Null
[IO.File]::WriteAllText((Join-Path $web 'index.html'), $html, $utf8)
Write-Host "T-Ford-Speedway.html written, $([Math]::Round((Get-Item $out).Length / 1KB)) KB"
