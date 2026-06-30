param(
  [int]$Port = 3333,
  [string]$HostAddress = "0.0.0.0",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ServerDir = Join-Path $RepoRoot "apps\server"

Set-Location $ServerDir

if (-not $SkipBuild) {
  npm run build
}

$env:PORT = [string]$Port
$env:LUDOVIVE_HOST = $HostAddress

$addresses = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { -not $_.IPAddress.StartsWith("127.") -and $_.PrefixOrigin -ne "WellKnown" } |
  Sort-Object InterfaceAlias, IPAddress

Write-Host ""
Write-Host "Ludovive LAN server"
Write-Host "Dashboard local : http://127.0.0.1:$Port/"
Write-Host "Participant local: http://127.0.0.1:$Port/play"
Write-Host ""
Write-Host "URLs a tester depuis les telephones sur le meme Wi-Fi:"
foreach ($address in $addresses) {
  Write-Host ("- {0}: http://{1}:{2}/play" -f $address.InterfaceAlias, $address.IPAddress, $Port)
}
Write-Host ""
Write-Host "Si un telephone ne se connecte pas: verifier le meme Wi-Fi, le pare-feu Windows, ou utiliser un hotspot dedie."
Write-Host ""

node dist/index.js
