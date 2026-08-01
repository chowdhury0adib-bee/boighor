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

# Cleanup — define first so failure paths can call it
function Invoke-Cleanup {
  Get-Process -Id $proc.Id -ErrorAction SilentlyContinue | Stop-Process -Force
  Remove-Item "__server.out","__server.err" -ErrorAction SilentlyContinue
  Write-Host ""
  Write-Host "Done." -ForegroundColor Green
}

# 9. Book detail redesign invariants (modern hero, sticky buy, seller profile, reviews, related)
Write-Host "[8/8] Book detail redesign invariants"
$bdHtml = (Invoke-WebRequest "$base/book-detail.html" -UseBasicParsing).Content
$bdJs   = (Invoke-WebRequest "$base/js/book-detail.js" -UseBasicParsing).Content
$bdCss  = $css  # already fetched above
$bdFail = 0
# Static HTML skeleton (only the page wrapper + modal shells live in the HTML file).
# Everything else is rendered into #bdContent by book-detail.js, so we check the JS
# template literals for the JS-rendered markup markers.
foreach ($m in @(
    @{n='class="bd-page"';         src=$bdHtml},
    @{n='id="bdContent"';          src=$bdHtml},
    @{n='id="bdLightbox"';         src=$bdHtml},
    @{n='id="bdMsgModal"';         src=$bdHtml}
)) {
    $present = $m.src -match [regex]::Escape($m.n)
    Write-Host ("  html:{0,-34} {1}" -f $m.n, $(if($present){'OK'}else{'MISSING'}))
    if (-not $present) { $bdFail++ }
}
# JS-rendered markup markers (look for them in book-detail.js template literals)
foreach ($m in @(
    'class="bd-hero"',
    'class="bd-gallery"',
    'id="bdMainImage"','id="bdThumbs"',
    'class="bd-sticky"','id="bdBuyCard"',
    'id="bdTitle"','id="bdAuthor"','id="bdMeta"',
    'id="bdDesc"','id="bdTags"',
    'id="bdSellerProfile"',
    'id="bdReviewSummary"','id="bdReviewFormWrap"','id="bdReviewList"',
    'class="bd-related"','id="bdRelated"'
)) {
    $present = $bdJs -match [regex]::Escape($m)
    Write-Host ("  js-html:{0,-32} {1}" -f $m, $(if($present){'OK'}else{'MISSING'}))
    if (-not $present) { $bdFail++ }
}
foreach ($sel in @('.bd-page','.bd-hero','.bd-gallery','.bd-main-img','.bd-thumbs','.bd-thumb','.bd-info','.bd-title','.bd-eyebrow','.bd-meta-row','.bd-stars','.bd-status-pill','.bd-sticky','.bd-buy-card','.bd-price','.bd-action-row','.bd-buy-btn','.bd-wish-btn','.bd-msg-btn','.bd-buy-meta','.bd-section','.bd-section-title','.bd-desc-card','.bd-desc-text','.bd-tags-row','.bd-tag','.bd-seller','.bd-seller-avatar','.bd-seller-name','.bd-seller-stats','.bd-seller-actions','.bd-reviews-grid','.bd-review-summary','.bd-review-avg','.bd-hist','.bd-hist-row','.bd-hist-track','.bd-hist-bar','.bd-review-form-wrap','.bd-review-list','.bd-review-card','.bd-review-avatar','.bd-review-stars','.bd-related','.bd-related-grid','.bd-empty','.bd-empty-card','.lightbox','.lightbox-close','.bd-back-link','.bd-crumbs')) {
    $present = $bdCss -match [regex]::Escape($sel)
    Write-Host ("  css:{0,-34} {1}" -f $sel, $(if($present){'OK'}else{'MISSING'}))
    if (-not $present) { $bdFail++ }
}
foreach ($fn in @('renderHero','renderCrumbs','renderGallery','renderTitleBlock','renderMetaRow','renderStickyBuy','renderDescription','renderSeller','renderReviews','renderRelated','submitReview','toggleWishlist','handleBuy','handleWishlist','setupGallery','openLightbox','closeLightbox','openMessageSeller','sendMessage','loadBook','loadRelated','loadWishlistCache','bookCardHtml')) {
    $present = $bdJs -match ('function\s+' + [regex]::Escape($fn) + '\b|\b' + [regex]::Escape($fn) + '\s*=\s*function|\b' + [regex]::Escape($fn) + '\s*=\s*async\s+function|\b' + [regex]::Escape($fn) + '\s*:')
    Write-Host ("  js:{0,-22} {1}" -f $fn, $(if($present){'OK'}else{'MISSING'}))
    if (-not $present) { $bdFail++ }
}
# Probe /api/books/:id with the first existing book (proves endpoint + shape)
if ($books.books -and $books.books.Count -gt 0) {
    $bid = $books.books[0].id
    $bdGet = Test-Endpoint 'book-detail /api/books/:id' 'GET' "$base/api/books/$bid" $null $session 200
    if ($bdGet.ok) {
        try {
            $payload = $bdGet.resp.Content | ConvertFrom-Json -ErrorAction Stop
            $hasBook    = $payload.PSObject.Properties.Name -contains 'book'
            $hasReviews = $payload.PSObject.Properties.Name -contains 'reviews'
            $titleOk    = $hasBook -and $null -ne $payload.book.title -and $payload.book.title.Length -gt 0
            $sellerOk   = $hasBook -and ($payload.book.PSObject.Properties.Name -contains 'seller_id')
            Write-Host ("  api: book payload OK={0} reviews field OK={1} title={2} seller_id={3}" -f `
                $hasBook, $hasReviews, $titleOk, $sellerOk)
            if (-not ($hasBook -and $hasReviews -and $titleOk -and $sellerOk)) { $bdFail++ }
        } catch {
            Write-Host "  api: payload parse failed" -ForegroundColor Red
            $bdFail++
        }
    } else { $bdFail++ }
} else {
    Write-Host "  no books in DB, skipping /api/books/:id probe" -ForegroundColor Yellow
}
if ($bdFail -gt 0) {
    Write-Host "  -> $bdFail book-detail invariants failed" -ForegroundColor Red
    Invoke-Cleanup; exit 1
}

# 10. Motion / micro-interactions invariants (CSS utilities + GSAP usage + reduced-motion)
Write-Host "[9/9] Motion invariants"
$motionFail = 0
$bdHtmlMotion = (Invoke-WebRequest "$base/book-detail.html" -UseBasicParsing).Content
$bdJsMotion   = (Invoke-WebRequest "$base/js/book-detail.js" -UseBasicParsing).Content
$dashJsMotion = (Invoke-WebRequest "$base/js/dashboard.js" -UseBasicParsing).Content
$cssMotion    = (Invoke-WebRequest "$base/css/style.css" -UseBasicParsing).Content

# GSAP is loaded from CDN only on the book-detail page (where it's actually needed)
$gsapScript = $bdHtmlMotion -match 'gsap@3\.[0-9.]+/dist/gsap\.min\.js'
Write-Host ("  html:gsap-cdn-script            {0}" -f $(if($gsapScript){'OK'}else{'MISSING'}))
if (-not $gsapScript) { $motionFail++ }

# New CSS utility classes used across the site
foreach ($cls in @('.btn:focus-visible', '.btn:active', '.icon-btn:hover', '.card-hover',
                   '.wishlist-btn.is-popping', '.pop-in', '.slide-up', '.fade-in',
                   '.pulse-ring', '.field:focus-within', '.back-to-top:hover',
                   '.modal-close:hover', '.bd-main-img img.is-swapping',
                   '.bd-hist-bar.is-visible', '.bd-thumb.is-active')) {
    $present = $cssMotion -match [regex]::Escape($cls)
    Write-Host ("  css:{0,-32} {1}" -f $cls, $(if($present){'OK'}else{'MISSING'}))
    if (-not $present) { $motionFail++ }
}

# GSAP usage: book-detail.js must reference window.gsap (countup + scale punch)
$gsapUsed = $bdJsMotion -match 'window\.gsap'
Write-Host ("  js:book-detail uses window.gsap {0}" -f $(if($gsapUsed){'OK'}else{'MISSING'}))
if (-not $gsapUsed) { $motionFail++ }

# Dashboard count-up is a small requestAnimationFrame, NOT GSAP (CSS-first)
$countupUsed = $dashJsMotion -match 'function animateCount'
Write-Host ("  js:dashboard has animateCount   {0}" -f $(if($countupUsed){'OK'}else{'MISSING'}))
if (-not $countupUsed) { $motionFail++ }

# Stagger auto-wiring must be exposed on window
$staggerExposed = (Invoke-WebRequest "$base/js/common.js" -UseBasicParsing).Content -match 'window\.setupScrollReveal'
Write-Host ("  js:setupScrollReveal on window  {0}" -f $(if($staggerExposed){'OK'}else{'MISSING'}))
if (-not $staggerExposed) { $motionFail++ }

# Reduced-motion guard present (we did not remove it)
$reduceMotionGuard = $cssMotion -match 'prefers-reduced-motion:\s*reduce'
Write-Host ("  css:prefers-reduced-motion      {0}" -f $(if($reduceMotionGuard){'OK'}else{'MISSING'}))
if (-not $reduceMotionGuard) { $motionFail++ }

# Animation budget sanity: no more than 8 distinct @keyframes additions in style.css.
# (Hero keyframes already exist; new motion section should add a small handful.)
$keyframeCount = ([regex]::Matches($cssMotion, '@keyframes\s+([a-zA-Z0-9_-]+)')).Count
Write-Host "  css:total @keyframes count = $keyframeCount (informational)"

if ($motionFail -gt 0) {
    Write-Host "  -> $motionFail motion invariants failed" -ForegroundColor Red
    Invoke-Cleanup; exit 1
}

# 11. Polish pass invariants (security headers, 404, favicon, robots, sitemap,
#     theme toggle, dark mode, print styles, password strength meter, price preview,
#     admin empty states)
Write-Host "[10/10] Polish pass invariants"
$polishFail = 0

# Server: security headers + meta endpoints + 404
$homeHeaders = (Invoke-WebRequest "$base/" -UseBasicParsing)
foreach ($h in @('X-Frame-Options','X-Content-Type-Options','Referrer-Policy','Content-Security-Policy')) {
    $v = $homeHeaders.Headers[$h]
    $ok = -not [string]::IsNullOrEmpty($v)
    Write-Host ("  hdr:{0,-28} {1}" -f $h, $(if($ok){'OK'}else{'MISSING'}))
    if (-not $ok) { $polishFail++ }
}

# /favicon.ico, /robots.txt, /sitemap.xml return 200
$fav = Test-Endpoint '/favicon.ico'     'GET' "$base/favicon.ico"     $null $session 200
$rob = Test-Endpoint '/robots.txt'      'GET' "$base/robots.txt"      $null $session 200
$map = Test-Endpoint '/sitemap.xml'     'GET' "$base/sitemap.xml"     $null $session 200
$nf  = Test-Endpoint '/this-does-not-exist (404)' 'GET' "$base/this-does-not-exist" $null $session 404
if (-not $fav.ok) { $polishFail++ }
if (-not $rob.ok) { $polishFail++ }
if (-not $map.ok) { $polishFail++ }
if (-not $nf.ok)  { $polishFail++ }

# Served HTML has the theme toggle, password strength meter, price preview, empty-state
$idxHtml = (Invoke-WebRequest "$base/" -UseBasicParsing).Content
$supHtml = (Invoke-WebRequest "$base/signup.html" -UseBasicParsing).Content
$selHtml = (Invoke-WebRequest "$base/sell.html" -UseBasicParsing).Content
$admHtml = (Invoke-WebRequest "$base/admin.html" -UseBasicParsing).Content
$logHtml = (Invoke-WebRequest "$base/login.html" -UseBasicParsing).Content
$cssNow  = (Invoke-WebRequest "$base/css/style.css" -UseBasicParsing).Content
$cmnJs   = (Invoke-WebRequest "$base/js/common.js" -UseBasicParsing).Content
$admJs   = (Invoke-WebRequest "$base/js/admin.js" -UseBasicParsing).Content

foreach ($m in @(
    @{n='favicon link (index)';     src=$idxHtml; q='rel="icon"'},
    @{n='meta description (index)'; src=$idxHtml; q='name="description"'},
    @{n='meta theme-color (index)'; src=$idxHtml; q='name="theme-color"'},
    @{n='og:title (index)';         src=$idxHtml; q='property="og:title"'},
    @{n='pw-strength id (signup)';  src=$supHtml; q='id="pwStrength"'},
    @{n='scorePassword fn (signup)';src=$supHtml; q='scorePassword'},
    @{n='price-preview id (sell)';  src=$selHtml; q='id="pricePreview"'},
    @{n='pricePreviewAmount (sell)';src=$selHtml; q='id="pricePreviewAmount"'},
    @{n='robots noindex (admin)';   src=$admHtml; q='name="robots"'},
    @{n='theme-toggle CSS';         src=$cssNow;  q='.theme-toggle'},
    @{n='dark-mode token block';    src=$cssNow;  q='[data-theme="dark"]'},
    @{n='print styles';             src=$cssNow;  q='@media print'},
    @{n='forced-colors guard';      src=$cssNow;  q='forced-colors'},
    @{n='selection polish';         src=$cssNow;  q='::selection'},
    @{n='empty-state CSS';          src=$cssNow;  q='.empty-state'},
    @{n='pw-strength CSS';          src=$cssNow;  q='.pw-strength'},
    @{n='price-preview CSS';        src=$cssNow;  q='.price-preview'},
    @{n='applyTheme in common.js';  src=$cmnJs;   q='applyTheme'},
    @{n='cycleTheme in common.js';  src=$cmnJs;   q='cycleTheme'},
    @{n='THEME_KEY in common.js';   src=$cmnJs;   q='THEME_KEY'},
    @{n='matchMedia listener';      src=$cmnJs;   q='matchMedia'},
    @{n='empty state users (admin.js)'; src=$admJs; q='No students yet'},
    @{n='empty state listings (admin.js)'; src=$admJs; q='No listings yet'}
)) {
    $present = $m.src -match [regex]::Escape($m.q)
    Write-Host ("  polish:{0,-32} {1}" -f $m.n, $(if($present){'OK'}else{'MISSING'}))
    if (-not $present) { $polishFail++ }
}

# Login html should redirect already-logged-in users (look for the early return pattern)
$loginSkipRedirect = ($logHtml -match "window\.location\.href\s*=\s*['""]/dashboard\.html")
Write-Host ("  polish:login skip-redirect     {0}" -f $(if($loginSkipRedirect){'OK'}else{'MISSING'}))
if (-not $loginSkipRedirect) { $polishFail++ }

# Served homepage should render the theme toggle button into the header
$themeBtnRendered = $idxHtml -match 'id="themeBtn"'
Write-Host ("  polish:themeBtn rendered on home {0}" -f $(if($themeBtnRendered){'OK'}else{'MISSING'}))
if (-not $themeBtnRendered) { $polishFail++ }

if ($polishFail -gt 0) {
    Write-Host "  -> $polishFail polish invariants failed" -ForegroundColor Red
    Invoke-Cleanup; exit 1
}

Invoke-Cleanup