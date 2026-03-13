Param(
  [switch]$Prod,
  [string]$SiteId
)

$publishDir = Join-Path $PSScriptRoot 'frontend\public'
if (-not (Test-Path $publishDir)) {
  Write-Error "Publish directory not found: $publishDir"
  exit 1
}

Write-Output "Publish directory: $publishDir"

# Prefer local netlify if installed, fallback to npx
if (Get-Command netlify -ErrorAction SilentlyContinue) {
  $exe = 'netlify'
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
  $exe = 'npx netlify-cli'
} else {
  Write-Error "Neither 'netlify' nor 'npx' found. Install Node.js and run 'npm i -g netlify-cli' or use npx."
  exit 2
}

$siteArg = ''
if ($SiteId) { $siteArg = " --site $SiteId" }
$prodArg = ''
if ($Prod) { $prodArg = ' --prod' }

$command = "$exe deploy --dir \"$publishDir\"$siteArg$prodArg"
Write-Output "Executing: $command"

try {
  iex $command
} catch {
  Write-Error "Deploy failed: $($_.Exception.Message)"
  exit 3
}
