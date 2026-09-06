# Run from the extracted Windows verification bundle; does not uninstall the app.
[CmdletBinding()]
param([string]$BinaryDirectory)
$ErrorActionPreference = 'Stop'
# Resolve the script path in the script body, not a parameter default: the
# automatic script variables can be empty during parameter binding.
$runnerDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($BinaryDirectory)) {
    $BinaryDirectory = $runnerDirectory
}
$BinaryDirectory = (Resolve-Path -LiteralPath $BinaryDirectory).ProviderPath
foreach ($name in @('updater.test.exe', 'services.test.exe')) {
    if (!(Test-Path -LiteralPath (Join-Path $BinaryDirectory $name) -PathType Leaf)) {
        throw "Missing $name in $BinaryDirectory. Extract the complete test bundle before running it."
    }
}
foreach ($name in @('test-verify-release.ps1', 'verify-release.ps1')) {
    if (!(Test-Path -LiteralPath (Join-Path $runnerDirectory $name) -PathType Leaf)) {
        throw "Missing $name beside this script. Extract the complete test bundle before running it."
    }
}
if ($env:OS -ne 'Windows_NT') { throw 'Run this test bundle on Windows x64.' }
if (![Environment]::Is64BitProcess) { throw 'Use 64-bit Windows PowerShell.' }

& (Join-Path $BinaryDirectory 'updater.test.exe') -test.v -test.run '^TestAppUpdaterReleaseVerification$'
if ($LASTEXITCODE -ne 0) { throw 'Updater integration tests failed.' }
& (Join-Path $BinaryDirectory 'services.test.exe') -test.v -test.run '^(TestAppUpdate|TestNormalizeAppVersion|TestSyncWindowsInstallRegistryVersion)'
if ($LASTEXITCODE -ne 0) { throw 'Updater service or registry tests failed.' }
& powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $runnerDirectory 'test-verify-release.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Release verifier regression tests failed.' }
Write-Host 'All automated Windows updater checks passed.'
Write-Host 'Signature results in the verifier tests are simulated. Real signed-release verification and manual uninstall checks are separate.'
