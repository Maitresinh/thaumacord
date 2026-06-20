param(
  [ValidateSet("audit", "apply")]
  [string]$Command = "audit"
)

$ErrorActionPreference = "Stop"

if (-not $env:TAIGA_BASE_URL) {
  $env:TAIGA_BASE_URL = "https://taiga.500nuancesdegeek.fr"
}

if ($Command -eq "apply" -and -not $env:TAIGA_AUTH_TOKEN -and -not $env:TAIGA_PASSWORD) {
  $secure = Read-Host "Taiga password" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $env:TAIGA_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

node "$PSScriptRoot/taiga-scrum-sync.js" $Command
