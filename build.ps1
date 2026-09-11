# Builds two outputs from wallet_app.template.html:
#   wallet_app.html  - artifact body (published to the AI assistant artifact)
#   index.html       - standalone installable PWA (Add to Home Screen -> fullscreen)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$enc  = New-Object System.Text.UTF8Encoding($false)

$tpl  = [IO.File]::ReadAllText("$root\wallet_app.template.html")
$cash = [IO.File]::ReadAllText("$root\applecash_b64.txt").Trim()
$pass = [IO.File]::ReadAllText("$root\pass_b64.txt").Trim()

$body = $tpl.Replace("__APPLECASH_IMG__", "data:image/jpeg;base64,$cash").
             Replace("__PASS_IMG__",      "data:image/jpeg;base64,$pass")

# ---- artifact body ----
[IO.File]::WriteAllText("$root\wallet_app.html", $body, $enc)
Write-Host "Built wallet_app.html ($($body.Length) chars)"

# ---- standalone installable PWA ----
$icon = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$root\app_icon.png"))
$head = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Wallet">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#E9E9EE" media="(prefers-color-scheme: light)">
<meta name="format-detection" content="telephone=no">
<link rel="apple-touch-icon" href="data:image/png;base64,$icon">
<link rel="icon" href="data:image/png;base64,$icon">
<style>
  *{ -webkit-tap-highlight-color: transparent; }
  html,body{ margin:0; background:#000; }
  img{ max-width:100%; }
  [hidden]{ display:none !important; }
</style>
"@
$tail = "`n</body>`n</html>`n"
$standalone = $head + "`n" + $body + $tail
[IO.File]::WriteAllText("$root\index.html", $standalone, $enc)
Write-Host "Built index.html ($($standalone.Length) chars)"
