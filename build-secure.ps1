# Run in PowerShell 7. Keys and DPAPI-protected password live outside the repository.
$ErrorActionPreference = 'Stop'
$taskSigningDir = if ($env:JXAU_SIGNING_DIR) { $env:JXAU_SIGNING_DIR } else { Join-Path $env:USERPROFILE '.jxau-pocket-signing' }
$taskSecret = ConvertTo-SecureString ((Get-Content -LiteralPath (Join-Path $taskSigningDir 'password.dpapi') -Raw).Trim())
$taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
try {
    $env:JXAU_RELEASE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
    python (Join-Path $PSScriptRoot 'build.py') @args
    if ($LASTEXITCODE) { throw 'Android build failed' }
} finally {
    Remove-Item Env:JXAU_RELEASE_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer)
}
