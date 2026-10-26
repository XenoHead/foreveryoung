<#
    build-deploy-stage.ps1 — assemble the customer deploy directory from an allowlist.

    Why this exists (worklist 1.3, finding F6):
    `wrangler pages deploy <repo>` uploaded the whole repo — schema.sql, deploy.bat,
    wrangler.toml, server.js and the notes all returned 200 on the live host, and
    `.assetsignore` was not applied at all (only dotfiles were dropped). A deny-list
    cannot be trusted, so the deploy directory is now built from this allowlist instead.

    Only the items below ever reach the customer host. Everything else at the repo
    root (source, notes, scripts, configs, .env) stays local by default.

    Usage (deploy.bat calls this):
        powershell -NoProfile -ExecutionPolicy Bypass -File build-deploy-stage.ps1 `
            -SourceDir C:\Git\ForeverYoung -StageDir %TEMP%\fy-deploy-stage
#>

param(
    [Parameter(Mandatory = $true)][string]$SourceDir,
    [Parameter(Mandatory = $true)][string]$StageDir
)

$ErrorActionPreference = 'Stop'

# --- allowlist -------------------------------------------------------------
# Root file patterns that are part of the public site.
$files = @(
    '*.html',        # all pages, including online-product-editor.html (1.2 decides its fate)
    '*.css',
    '*.png',
    'CNAME',
    'favicon.ico',
    'robots.txt',
    'sitemap.xml',
    '_headers',      # Pages control files, harmless when absent
    '_redirects',
    '_routes.json'
)

# Directories that are part of the public site.
$dirs = @(
    'images',
    'fonts',
    'functions'      # Pages Functions must sit at the deploy root
)

# --- guards ----------------------------------------------------------------
if (-not (Test-Path $SourceDir)) { throw "SourceDir not found: $SourceDir" }

$srcFull = (Resolve-Path $SourceDir).Path.TrimEnd('\')
$stageFull = [IO.Path]::GetFullPath($StageDir).TrimEnd('\')

if ($srcFull -eq $stageFull) { throw 'Refusing to stage over the source directory.' }
if ($srcFull.StartsWith($stageFull + '\')) { throw 'Refusing to stage a parent of the source directory.' }

# --- build -----------------------------------------------------------------
if (Test-Path $stageFull) {
    Write-Host "  - clearing previous stage"
    Remove-Item $stageFull -Recurse -Force
}
New-Item -ItemType Directory -Path $stageFull -Force | Out-Null

$copied = 0
foreach ($pattern in $files) {
    $hits = Get-ChildItem -Path (Join-Path $srcFull $pattern) -File -ErrorAction SilentlyContinue
    foreach ($hit in $hits) {
        Copy-Item $hit.FullName -Destination $stageFull -Force
        $copied++
    }
}

foreach ($dir in $dirs) {
    $src = Join-Path $srcFull $dir
    if (Test-Path $src) {
        Copy-Item $src -Destination (Join-Path $stageFull $dir) -Recurse -Force
    }
    else {
        Write-Host "  [!] expected directory not found: $dir" -ForegroundColor Yellow
    }
}

# --- verify ----------------------------------------------------------------
foreach ($required in @('index.html', 'functions')) {
    if (-not (Test-Path (Join-Path $stageFull $required))) {
        throw "Stage is missing a required item: $required"
    }
}

# Leak guard: nothing non-public may have slipped in.
$nonPublic = Get-ChildItem $stageFull -Recurse -File |
    Where-Object { $_.Name -eq '.env' -or $_.Extension -in @('.sql', '.bat', '.md', '.py', '.toml') }
if ($nonPublic) {
    throw "Stage contains non-public files: $(($nonPublic | ForEach-Object { $_.Name }) -join ', ')"
}

$all = Get-ChildItem $stageFull -Recurse -File
$mb = [math]::Round((($all | Measure-Object Length -Sum).Sum / 1MB), 1)

Write-Host "  - staged $($all.Count) files, $mb MB -> $stageFull" -ForegroundColor Green
Write-Host "  - root files shipped: $(($all | Where-Object { $_.DirectoryName -eq $stageFull } | ForEach-Object { $_.Name } | Sort-Object) -join ', ')"

# Show what was deliberately left behind, so drift is visible at deploy time.
$skipped = Get-ChildItem $srcFull -File |
    Where-Object { $_.Name -notin @($all | Where-Object { $_.DirectoryName -eq $stageFull } | ForEach-Object { $_.Name }) } |
    ForEach-Object { $_.Name } | Sort-Object
Write-Host "  - left local (first 12): $((($skipped | Select-Object -First 12) -join ', '))"
