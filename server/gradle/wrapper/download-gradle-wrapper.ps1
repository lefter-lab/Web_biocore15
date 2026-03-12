$urls = @(
  'https://raw.githubusercontent.com/gradle/gradle/master/gradle/wrapper/gradle-wrapper.jar',
  'https://raw.githubusercontent.com/gradle/gradle/v8.4.1/gradle/wrapper/gradle-wrapper.jar'
)
$out = Join-Path $PSScriptRoot 'gradle-wrapper.jar'
Write-Host "Downloading gradle-wrapper.jar to $out"
foreach ($u in $urls) {
  try {
    Invoke-WebRequest -Uri $u -OutFile $out -UseBasicParsing -ErrorAction Stop
    Write-Host "Downloaded from ${u}"
    exit 0
  } catch {
    Write-Host "Failed from ${u}: $($_.Exception.Message)"
  }
}
Write-Error "Could not download gradle-wrapper.jar from known locations."
exit 1
