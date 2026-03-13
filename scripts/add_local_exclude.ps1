$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root
$exclude = Join-Path $root '.git\info\exclude'
if (-not (Test-Path $exclude)) {
  New-Item -ItemType File -Path $exclude | Out-Null
}
$pattern = 'INTERNAL_REPORT.md'
$content = Get-Content $exclude -ErrorAction SilentlyContinue
if ($content -notcontains $pattern) {
  Add-Content -Path $exclude -Value $pattern
  Write-Output 'exclude-updated'
} else {
  Write-Output 'already-excluded'
}
