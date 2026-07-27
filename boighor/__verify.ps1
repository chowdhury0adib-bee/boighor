# __verify.ps1 — full-stack verification for the premium-card redesign.
# Boots a fresh server, runs all critical flows, kills the server.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File ".\__verify.ps1"

$ErrorActionPreference = 'Stop'
$boighor = $PSScriptRoot
Set-Location $boighor

# 1. Make sure no stale node is hogging port 3000
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 400

# 2. Start server in background
$proc = Start-Process node -ArgumentList 'server.js' `
    -RedirectStandardOutput '__server.out' `
    -RedirectStandardError  '__server.err' `
    -PassThru
Start-Sleep -Seconds 2
if ((Get-Process -Id $proc.Id -ErrorAction SilentlyContinue) -eq $null) {
    Write-Host "FATAL: server did not start. stderr:" -ForegroundColor Red
    Get-Content '__server.err' -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "[1/6] Server up (pid $($proc.Id))"

function Test-Endpoint {
    param([string]$Name,[string]$Method,[string]$Url,[object]$Body,$Session,[int]$Expect)
    try {
        $params = @{
            Uri = $Url; Method = $Method; UseBasicParsing = $true
            TimeoutSec = 10; WebSession = $Session
        }
        if ($Body) {
            $params['ContentType'] = 'application/json'
            $params['Body'] = ($Body | ConvertTo-Json -Depth 5)
        }
        $r = Invoke-WebRequest @params
        $ok = ($r.StatusCode -eq $Expect)
        Write-Host ("  {0,-32} {1} {2}" -f $Name, $r.StatusCode, $(if($ok){'OK'}else{'FAIL'}))
        if (-not $ok) { Write-Host "  expected $Expect got $($r.StatusCode)" }
        return @{ ok = $ok; resp = $r }
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $ok = ($code -eq $Expect)
        Write-Host ("  {0,-32} {1} {2}" -f $Name, $code, $(if($ok){'OK'}else{'FAIL'}))
        try { $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream()); $body = $reader.ReadToEnd() } catch { $body = '' }
        return @{ ok = $ok; body = $body }
    }
}

$base   = 'http://localhost:3000'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# 3. Static + API smoke
Write-Host "[2/6] Static routes"
$tests = @(
    @{n='homepage'; url="$base/";           type='text/html'},
    @{n='login';    url="$base/login.html";  type='text/html'},
    @{n='signup';   url="$base/signup.html"; type='text/html'},
    @{n='sell';     url="$base/sell.html";   type='text/html'},
    @{n='dashboard';url="$base/dashboard.html";type='text/html'},
    @{n='book-detail';url="$base/book-detail.html";type='text/html'},
    @{n='admin';    url="$base/admin.html";  type='text/html'},
    @{n='style.css';url="$base/css/style.css";type='text/css'},
    @{n='common.js';url="$base/js/common.js";type='javascript'},
    @{n='index.js'; url="$base/js/index.js";type='javascript'},
    @{n='admin.js'; url="$base/js/admin.js";type='javascript'},
    @{n='dashboard.js';url="$base/js/dashboard.js";type='javascript'},
    @{n='book-detail.js';url="$base/js/book-detail.js";type='javascript'},
    @{n='books api';url="$base/api/books";  type='json'}
)
$fail = 0
foreach ($t in $tests) {
    try {
        $r = Invoke-WebRequest -Uri $t.url -UseBasicParsing -WebSession $session -TimeoutSec 10
        $ok = $r.StatusCode -eq 200
        Write-Host ("  {0,-15} {1,-5} {2}" -f $t.n, $r.StatusCode, $(if($ok){'OK'}else{'FAIL'}))
    } catch { $ok = $false; Write-Host ("  {0,-15} FAIL  {1}" -f $t.n, $_.Exception.Message) }
    if (-not $ok) { $fail++ }
}
if ($fail -gt 0) { Write-Host "  -> $fail of $($tests.Count) failed"; Invoke-Cleanup; exit 1 }

# 4. Visual / asset invariants on the homepage + served JS
Write-Host "[3/6] Served-asset invariants"
$js = (Invoke-WebRequest "$base/js/index.js" -UseBasicParsing).Content
$css = (Invoke-WebRequest "$base/css/style.css" -UseBasicParsing).Content
$html = (Invoke-WebRequest "$base/" -UseBasicParsing).Content
foreach ($marker in @('wishlistIds','loadWishlistCache','data-wishlist-toggle','sorted.map','loadBooks','renderChips','setupSearchExperience')) {
    $present = $js -match [regex]::Escape($marker)
    Write-Host ("  js:{0,-22} {1}" -f $marker, $(if($present){'OK'}else{'MISSING'}))
}
foreach ($sel in @('.book-card','.wishlist-btn','.condition-badge','.thumb-shine','.seller-avatar','.sold-stamp','.quick-actions','.card-cta','.info-row','.cat-tag','.seller-row','.seller-name','.seller-uni','.wishlist-burst','.price')) {
    $present = $css -match [regex]::Escape($sel)
    Write-Host ("  css:{0,-22} {1}" -f $sel, $(if($present){'OK'}else{'MISSING'}))
}
$hero = $html -match 'class="hero"'
$search = $html -match 'class="search-shell"'
Write-Host ("  hero present: {0}  search-shell present: {1}" -f $hero, $search)

# 5. End-to-end wishlist flow (admin login)
Write-Host "[4/6] Wishlist API end-to-end"
$null = Test-Endpoint 'login (admin)' 'POST' "$base/api/auth/login" @{email='admin@boighor.com';password='admin123'} $session 200
$me = Invoke-RestMethod -Uri "$base/api/auth/me" -Method GET -WebSession $session
Write-Host ("  me -> role=$($me.user.role), name=$($me.user.name)")

# Snapshot current wishlist
$cur = Invoke-RestMethod -Uri "$base/api/wishlist" -Method GET -WebSession $session
Write-Host ("  wishlist count before: $(@($cur.items).Count)")

# Find a book id from /api/books
$books = Invoke-RestMethod -Uri "$base/api/books" -Method GET -WebSession $session
if ($books.books -and $books.books.Count -gt 0) {
  $targetId = $books.books[0].id
  Write-Host ("  target book id = $targetId title='$($books.books[0].title)' seller='$($books.books[0].seller_name)' cond='$($books.books[0].condition_status)'")

  # Clear it first to start clean
  $existing = @($cur.items) | Where-Object { $_.id -eq $targetId }
  foreach ($e in $existing) {
      $null = Test-Endpoint 'wishlist delete (clear)' 'DELETE' "$base/api/wishlist/$($e.wishlist_id)" $null $session 200
  }

  # Add
  $null = Test-Endpoint 'wishlist add'  'POST'  "$base/api/wishlist" @{book_id=$targetId} $session 200
  # Verify present
  $cur = Invoke-RestMethod -Uri "$base/api/wishlist" -Method GET -WebSession $session
  $hit = @($cur.items) | Where-Object { $_.id -eq $targetId }
  Write-Host ("  wishlist count after add: $(@($cur.items).Count), hit=$(@($hit).Count)")
  $null = Test-Endpoint 'wishlist duplicate-add (expect 400)' 'POST' "$base/api/wishlist" @{book_id=$targetId} $session 400
  # Remove
  if (@($hit).Count -gt 0) {
    $row = $hit[0]
    $null = Test-Endpoint 'wishlist remove' 'DELETE' "$base/api/wishlist/$($row.wishlist_id)" $null $session 200
  }
  # Verify empty
  $cur = Invoke-RestMethod -Uri "$base/api/wishlist" -Method GET -WebSession $session
  Write-Host ("  wishlist count after remove: $(@($cur.items).Count)")
} else {
  Write-Host "  no books in DB, skipping wishlist flow" -ForegroundColor Yellow
}

# 5. Books endpoint shape (used by index.js card markup)
Write-Host "[5/6] /api/books shape for index.js"
if ($books.books -and $books.books.Count -gt 0) {
  $b0 = $books.books[0]
  $expected = 'id','title','author','category','condition_status','image','price','status','seller_name','seller_university'
  foreach ($k in $expected) {
      $present = ($b0.PSObject.Properties.Name -contains $k)
      Write-Host ("  field:{0,-22} {1}" -f $k, $(if($present){'OK'}else{'MISSING'}))
  }
} else {
  Write-Host "  no books in DB, skipping shape check" -ForegroundColor Yellow
}

# 7. Served index.js sanity (no debug traces)
Write-Host "[6/6] Served index.js sanity"
$debugTraces = ([regex]::Matches($js, '\[(boot|loadBooks|trace|api|cardsmoke)\]')).Count
Write-Host "  debug traces in served index.js: $debugTraces (expect 0)"
$hasLoadBooks = $js -match 'function loadBooks'
$hasWishlistCache = $js -match 'function loadWishlistCache'
$hasWishlistIds = $js -match 'const wishlistIds'
Write-Host "  has loadBooks: $hasLoadBooks  loadWishlistCache: $hasWishlistCache  wishlistIds: $hasWishlistIds"

# 8. Dashboard redesign invariants (HTML structure + endpoints + JS markers)
Write-Host "[7/7] Dashboard redesign invariants"
$dashHtml = (Invoke-WebRequest "$base/dashboard.html" -UseBasicParsing).Content
$dashJs   = (Invoke-WebRequest "$base/js/dashboard.js" -UseBasicParsing).Content
$dashCss  = $css  # already fetched above
$dashFail = 0
foreach ($m in @(
    'class="kpi-strip"',
    'id="kpiListings"','id="kpiOrders"','id="kpiPurchases"','id="kpiWishlist"','id="kpiRevenue"',
    'id="donutListingsSlices"','id="donutMidNum"','id="donutListingsLegend"',
    'id="barActivity"',
    'class="tab-bar"',
    'data-tab="listings"','data-tab="orders-received"','data-tab="purchases"','data-tab="wishlist"',
    'id="tab-listings"','id="tab-orders-received"','id="tab-purchases"','id="tab-wishlist"',
    'id="tabSelect"'
)) {
    $present = $dashHtml -match [regex]::Escape($m)
    Write-Host ("  html:{0,-32} {1}" -f $m, $(if($present){'OK'}else{'MISSING'}))
    if (-not $present) { $dashFail++ }
}
foreach ($sel in @('.dash-hero','.kpi-strip','.kpi-ico','.kpi-value','.kpi-trend','.donut','.donut-track','.donut-legend','.bar-chart','.bar-swatch--received','.bar-swatch--purchases','.tab-bar','.tab-btn-count','.tab-select-wrap','.dash-table','.dash-table-wrap','.pill--available','.pill--sold','.pill--pending','.pill--completed','.pill--cancelled','.dash-empty')) {
    $present = $dashCss -match [regex]::Escape($sel)
    Write-Host ("  css:{0,-32} {1}" -f $sel, $(if($present){'OK'}else{'MISSING'}))
    if (-not $present) { $dashFail++ }
}
foreach ($fn in @('renderHero','renderKpis','renderDonut','renderBarChart','loadListings','loadOrdersReceived','loadPurchases','loadWishlist','setupTabs','refreshAll')) {
    $present = $dashJs -match ('function\s+' + [regex]::Escape($fn))
    Write-Host ("  js:{0,-22} {1}" -f $fn, $(if($present){'OK'}else{'MISSING'}))
    if (-not $present) { $dashFail++ }
}
$null = Test-Endpoint 'dashboard /api/books/mine/list'    'GET' "$base/api/books/mine/list"        $null $session 200
$null = Test-Endpoint 'dashboard /api/orders/received'     'GET' "$base/api/orders/received"        $null $session 200
$null = Test-Endpoint 'dashboard /api/orders/my-purchases' 'GET' "$base/api/orders/my-purchases"    $null $session 200
$null = Test-Endpoint 'dashboard /api/wishlist'            'GET' "$base/api/wishlist"               $null $session 200
if ($dashFail -gt 0) {
    Write-Host "  -> $dashFail dashboard invariants failed" -ForegroundColor Red
    Invoke-Cleanup; exit 1
}

# Cleanup — wrap in a function so the `goto` target is a real callable block
function Invoke-Cleanup {
  Get-Process -Id $proc.Id -ErrorAction SilentlyContinue | Stop-Process -Force
  Remove-Item "__server.out","__server.err" -ErrorAction SilentlyContinue
  Write-Host ""
  Write-Host "Done." -ForegroundColor Green
}
Invoke-Cleanup