param(
  [ValidateRange(1024, 65535)][int]$Port = 8767,
  [switch]$Lan,
  [switch]$NoBrowser,
  [switch]$PrepareImages
)

$ErrorActionPreference = 'Stop'
$scriptsDirectory = Join-Path $PSScriptRoot 'scripts'
if ($PrepareImages) {
  $node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $node) { throw 'Node.js is required to prepare atlas images.' }

  & $node.Source (Join-Path $scriptsDirectory 'fetch-images.mjs')
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Some images could not be downloaded. See the image results above.' }

  foreach ($script in @('build.mjs', 'make-preview.mjs')) {
    & $node.Source (Join-Path $scriptsDirectory $script)
    if ($LASTEXITCODE -ne 0) { throw "Could not run $script." }
  }
}

$siteDirectory = Join-Path $PSScriptRoot 'dist'
$catalogFile = Join-Path $siteDirectory 'data/catalog.json'
if (-not (Test-Path -LiteralPath $catalogFile -PathType Leaf)) {
  throw 'Catalog is missing. Run node scripts/build.mjs first.'
}

$python = Get-Command python -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
$pythonOptions = @()
if (-not $python) {
  $python = Get-Command py -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $pythonOptions = @('-3')
}
if (-not $python) { throw 'Python 3 is required to launch the local atlas.' }

$binding = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }
$localUrl = "http://127.0.0.1:$Port/"
$serverScript = Join-Path $scriptsDirectory 'serve.py'
$serverArguments = $pythonOptions + @(('"' + $serverScript + '"'), $Port, '--bind', $binding, '--directory', ('"' + $siteDirectory + '"'))
$server = Start-Process -FilePath $python.Source -ArgumentList $serverArguments -WindowStyle Hidden -PassThru

try {
  $isReady = $false
  $readinessError = 'Unexpected response from the local server.'
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if ($server.HasExited) { break }
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri ($localUrl + 'sw.js') -TimeoutSec 1
      $body = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { $response.Content }
      if ($response.StatusCode -eq 200 -and $body -match 'space-atlas:') {
        $isReady = $true
        break
      }
    } catch { $readinessError = $_.Exception.Message }
    Start-Sleep -Milliseconds 200
  }
  if ($server.HasExited) { throw "Space Atlas server exited with code $($server.ExitCode) on port $Port. Check whether the port is in use or try -Port with a free port." }
  if (-not $isReady) { throw "Space Atlas server started, but the readiness check could not read $($localUrl)sw.js. $readinessError" }

  Write-Output "Space Atlas: $localUrl"
  if ($Lan) {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
      ForEach-Object { Write-Output ('iPad preview: http://{0}:{1}/' -f $_.IPAddress, $Port) }
    Write-Output 'LAN preview is browser-only over HTTP. Use an HTTPS deployment for iPad installation and offline access.'
  }
  Write-Output 'Leave this window open. Press Ctrl+C to stop.'
  if (-not $NoBrowser) { Start-Process $localUrl }
  while (-not $server.HasExited) { Start-Sleep -Milliseconds 750 }
  if ($server.ExitCode -ne 0) { throw "Space Atlas server exited with code $($server.ExitCode)." }
} finally {
  if (-not $server.HasExited) { Stop-Process -InputObject $server -ErrorAction SilentlyContinue }
}
