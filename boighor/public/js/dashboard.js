/* =====================================================================
 *  BoiGhor — Dashboard
 *  --------------------------------------------------------------------
 *  Renders the new modern dashboard layout:
 *    • Hero greeting
 *    • KPI strip (counts + revenue + trends)
 *    • Donut chart (listings by status) + Bar chart (weekly activity)
 *    • Tabbed tables (listings / orders received / purchases)
 *    • Wishlist (premium cards, reused from index)
 *
 *  Backend APIs are unchanged.
 * ===================================================================== */

// ---------------------------------------------------------------------
//  Tiny DOM helpers (kept local; common.js exposes api, toast, money, etc.)
// ---------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmt = (n) => Number(n || 0).toLocaleString();
const svgNS = 'http://www.w3.org/2000/svg';

// Status -> pill class (re-uses existing .pill / .status-pill CSS).
const PILL_CLASS = {
  available: 'pill--available',
  sold: 'pill--sold',
  pending: 'pill--pending',
  completed: 'pill--completed',
  cancelled: 'pill--cancelled',
  canceled: 'pill--cancelled',
};
function statusPill(status) {
  const s = String(status || '').toLowerCase();
  const cls = PILL_CLASS[s] || 'pill--available';
  const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
  return `<span class="pill ${cls}">${escapeHtml(label)}</span>`;
}

// ---------------------------------------------------------------------
//  Hero greeting + KPI strip
// ---------------------------------------------------------------------
function renderHero(user) {
  const greetEl = $('#greetName');
  const subEl = $('#dashHeroSub');
  if (greetEl) {
    const fullName = (user && user.name) || 'there';
    const first = fullName.split(' ')[0] || fullName;
    greetEl.textContent = first;
  }
  if (subEl) {
    const hour = new Date().getHours();
    let timeOfDay = 'Welcome back';
    if (hour < 5) timeOfDay = 'Still up';
    else if (hour < 12) timeOfDay = 'Good morning';
    else if (hour < 17) timeOfDay = 'Good afternoon';
    else if (hour < 21) timeOfDay = 'Good evening';
    else timeOfDay = 'Late night';
    subEl.textContent = `${timeOfDay} — here's a snapshot of your activity on BoiGhor.`;
  }
}

function setKpi(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function setTrend(id, text, dir = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || '\u00A0';
  el.classList.remove('is-up', 'is-down');
  if (dir === 'up') el.classList.add('is-up');
  else if (dir === 'down') el.classList.add('is-down');
}

function renderKpis({ listings, orders, purchases, wishlist, revenue }) {
  setKpi('kpiListings', fmt(listings.length));
  setKpi('kpiOrders', fmt(orders.length));
  setKpi('kpiPurchases', fmt(purchases.length));
  setKpi('kpiWishlist', fmt(wishlist.items.length));
  setKpi('kpiRevenue', money(revenue));

  // Simple trend: count of items created in the last 7 days.
  const sevenDays = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const since = (d) => d && new Date(d).getTime() >= sevenDays;
  setTrend('kpiListingsTrend', recentCount(listings, 'created_at'));
  setTrend('kpiOrdersTrend', recentCount(orders, 'created_at'));
  setTrend('kpiPurchasesTrend', recentCount(purchases, 'created_at'));
  setTrend('kpiWishlistTrend', recentCount(wishlist.items, 'created_at'));
  setTrend('kpiRevenueTrend', revenue ? `last 7d · ${money(recentRevenue(purchases))}` : 'No completed sales yet');

  // Hide empty badges so layout stays balanced.
  const badgeOrders = $('#tabBadgeOrders');
  if (badgeOrders) {
    const pending = orders.filter((o) => o.status === 'pending').length;
    if (pending > 0) {
      badgeOrders.textContent = pending;
      badgeOrders.hidden = false;
    } else {
      badgeOrders.hidden = true;
    }
  }
  const badgeWishlist = $('#tabBadgeWishlist');
  if (badgeWishlist) {
    const n = wishlist.items.length;
    if (n > 0) {
      badgeWishlist.textContent = n;
      badgeWishlist.hidden = false;
    } else {
      badgeWishlist.hidden = true;
    }
  }
}

function recentCount(rows, field) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const n = rows.filter((r) => r && r[field] && new Date(r[field]).getTime() >= cutoff).length;
  if (!n) return 'No new this week';
  return `${n} new this week`;
}

function recentRevenue(purchases) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return purchases
    .filter((p) => p.status === 'completed' && p.created_at && new Date(p.created_at).getTime() >= cutoff)
    .reduce((sum, p) => sum + Number(p.price || 0), 0);
}

// ---------------------------------------------------------------------
//  Donut chart — listings by status (pure SVG, no deps)
// ---------------------------------------------------------------------
const STATUS_COLORS = {
  available: '#2e6a4d',  // green
  sold:      '#b0432c',  // rust
  pending:   '#d3a12b',  // mustard
  reserved:  '#8a6818',
  completed: '#23402f',
  cancelled: '#9c9486',
  other:     '#9c9486',
};

function polar(cx, cy, r, angleRad) {
  return [cx + r * Math.cos(angleRad), cy + r * Math.sin(angleRad)];
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  // Draws a donut ring slice (annulus sector) using two arc commands.
  const [x1, y1] = polar(cx, cy, r, startAngle);
  const [x2, y2] = polar(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
  ].join(' ');
}

function renderDonut(listings) {
  const slicesG = $('#donutListingsSlices');
  const midNum = $('#donutMidNum');
  const legendEl = $('#donutListingsLegend');
  if (!slicesG || !legendEl) return;

  // Bucket by status.
  const buckets = new Map();
  listings.forEach((b) => {
    const k = String(b.status || 'other').toLowerCase();
    buckets.set(k, (buckets.get(k) || 0) + 1);
  });

  const total = listings.length;
  midNum.textContent = total;

  // Build slices — always start at top (-π/2).
  const cx = 60, cy = 60, r = 46;
  let start = -Math.PI / 2;
  const slices = [];
  buckets.forEach((count, key) => {
    const angle = (count / Math.max(total, 1)) * Math.PI * 2;
    const end = start + angle;
    const color = STATUS_COLORS[key] || STATUS_COLORS.other;
    slices.push({ key, count, color, start, end });
    start = end;
  });

  if (slices.length === 0) {
    slicesG.innerHTML = '';
    legendEl.innerHTML = `<li class="dash-empty-mini">No listings yet — list a book to see your mix.</li>`;
    return;
  }

  // Sort legend largest -> smallest.
  const legendItems = [...slices].sort((a, b) => b.count - a.count);

  slicesG.innerHTML = slices
    .map(
      (s) =>
        `<path d="${arcPath(cx, cy, r, s.start, s.end)}" fill="none" stroke="${s.color}" stroke-width="14" stroke-linecap="butt"></path>`,
    )
    .join('');

  legendEl.innerHTML = legendItems
    .map(
      (s) => `
        <li>
          <span class="legend-swatch" style="background:${s.color}"></span>
          <span class="legend-label">${escapeHtml(s.key)}</span>
          <span class="legend-value">${s.count}</span>
        </li>`,
    )
    .join('');
}

// ---------------------------------------------------------------------
//  Bar chart — orders received vs purchases, last 8 weeks (pure SVG)
// ---------------------------------------------------------------------
function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // Week starts Monday.
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function weekLabel(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function renderBarChart(ordersReceived, purchases) {
  const svg = $('#barActivity');
  if (!svg) return;

  const weeks = 8;
  const now = new Date();
  const thisWeek = startOfWeek(now);
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    buckets.push({
      start,
      end,
      label: weekLabel(start),
      received: 0,
      purchases: 0,
    });
  }

  const inBucket = (rows, field, b) =>
    rows.filter((r) => {
      const t = r[field] ? new Date(r[field]).getTime() : NaN;
      return Number.isFinite(t) && t >= b.start.getTime() && t < b.end.getTime();
    }).length;

  buckets.forEach((b) => {
    b.received = inBucket(ordersReceived, 'created_at', b);
    b.purchases = inBucket(purchases, 'created_at', b);
  });

  const W = 360, H = 180;
  const padL = 28, padR = 12, padT = 14, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxY = Math.max(1, ...buckets.map((b) => b.received + b.purchases));
  const niceMax = niceCeil(maxY);
  const groupW = innerW / buckets.length;
  const barW = Math.min(14, (groupW - 6) / 2);
  const gap = 4;

  const yTicks = [];
  for (let i = 0; i <= niceMax; i += Math.max(1, Math.floor(niceMax / 4) || 1)) {
    yTicks.push(i);
  }

  const ticks = yTicks
    .map((t) => {
      const y = padT + innerH - (t / niceMax) * innerH;
      return `<g>
        <line x1="${padL}" x2="${W - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(35,64,47,.08)"></line>
        <text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="rgba(35,64,47,.55)">${t}</text>
      </g>`;
    })
    .join('');

  const bars = buckets
    .map((b, i) => {
      const groupX = padL + i * groupW;
      const cx = groupX + groupW / 2;
      const recH = (b.received / niceMax) * innerH;
      const purH = (b.purchases / niceMax) * innerH;
      const recY = padT + innerH - recH;
      const purY = padT + innerH - purH;
      const recX = cx - barW - gap / 2;
      const purX = cx + gap / 2;
      return `
        <g class="bar-group" data-week="${b.label}">
          <rect x="${recX.toFixed(1)}" y="${recY.toFixed(1)}" width="${barW}" height="${Math.max(0, recH).toFixed(1)}" rx="2" fill="#2e6a4d">
            <title>${b.received} received</title>
          </rect>
          <rect x="${purX.toFixed(1)}" y="${purY.toFixed(1)}" width="${barW}" height="${Math.max(0, purH).toFixed(1)}" rx="2" fill="#d3a12b">
            <title>${b.purchases} purchases</title>
          </rect>
          <text x="${cx.toFixed(1)}" y="${(H - 8).toFixed(1)}" text-anchor="middle" font-size="9" fill="rgba(35,64,47,.6)">${b.label}</text>
        </g>`;
    })
    .join('');

  // Baseline
  const baseline = `<line x1="${padL}" x2="${W - padR}" y1="${padT + innerH}" y2="${padT + innerH}" stroke="rgba(35,64,47,.18)"></line>`;

  svg.innerHTML = ticks + baseline + bars;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
}

function niceCeil(n) {
  if (n <= 1) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const norm = n / pow;
  let nice;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * pow;
}

// ---------------------------------------------------------------------
//  Modern table-card renderers
// ---------------------------------------------------------------------
function paneHead(title, sub) {
  return `
    <div class="dash-tab-pane-head">
      <div>
        <h2>${escapeHtml(title)}</h2>
        ${sub ? `<p>${escapeHtml(sub)}</p>` : ''}
      </div>
    </div>`;
}

function emptyState({ title, message, cta }) {
  return `
    <div class="dash-empty">
      <span class="empty-mark" aria-hidden="true">·</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${cta ? `<a class="btn" href="${cta.href}">${escapeHtml(cta.label)}</a>` : ''}
    </div>`;
}

// ---------- Listings ----------
async function loadListings() {
  const el = $('#tab-listings');
  if (!el) return;
  try {
    const { books } = await api('/api/books/mine/list');
    if (!books.length) {
      el.innerHTML = emptyState({
        title: 'No listings yet',
        message: "You haven't listed any books. Share one with the BoiGhor community to get started.",
        cta: { href: '/sell.html', label: 'List Your First Book' },
      });
      return;
    }
    el.innerHTML = `
      ${paneHead('My Listings', `${books.length} book${books.length === 1 ? '' : 's'} you have listed.`)}
      <div class="dash-table-wrap">
        <table class="dash-table">
          <thead>
            <tr>
              <th class="col-thumb">&nbsp;</th>
              <th>Title</th>
              <th>Price</th>
              <th>Status</th>
              <th>Listed</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${books
              .map((b) => {
                const cover = b.image
                  ? `style="background-image:url('${escapeHtml(b.image)}')"`
                  : '';
                return `
                  <tr>
                    <td class="col-thumb"><span class="thumb" ${cover}></span></td>
                    <td class="col-title">
                      <a href="/book-detail.html?id=${b.id}">${escapeHtml(b.title)}</a>
                      <small>${escapeHtml(b.author || '')}</small>
                    </td>
                    <td class="col-price">${money(b.price)}</td>
                    <td>${statusPill(b.status)}</td>
                    <td>${formatDate(b.created_at)}</td>
                    <td class="col-actions">
                      ${b.status === 'available' ? `<button class="btn small ghost" data-mark-sold="${b.id}">Mark Sold</button>` : ''}
                      <button class="btn small danger" data-delete="${b.id}">Delete</button>
                    </td>
                  </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>`;

    el.querySelectorAll('[data-mark-sold]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.classList.add('btn-loading');
        try {
          await api(`/api/books/${btn.dataset.markSold}`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'sold' }),
          });
          toast('Marked as sold', 'success', 1500);
          await loadListings();
        } catch (err) {
          toast(err.message, 'error');
          btn.classList.remove('btn-loading');
        }
      });
    });
    el.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await confirmModal({
          title: 'Delete this listing?',
          message: 'This will permanently remove the book from your listings.',
          confirmText: 'Delete',
          danger: true,
        });
        if (!ok) return;
        btn.classList.add('btn-loading');
        try {
          await api(`/api/books/${btn.dataset.delete}`, { method: 'DELETE' });
          toast('Listing deleted', 'success', 1500);
          await loadListings();
        } catch (err) {
          toast(err.message, 'error');
          btn.classList.remove('btn-loading');
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="dash-empty"><h3>Could not load listings</h3><p>${escapeHtml(err.message || 'Please try again.')}</p></div>`;
  }
}

// ---------- Orders received ----------
async function loadOrdersReceived() {
  const el = $('#tab-orders-received');
  if (!el) return;
  try {
    const { orders } = await api('/api/orders/received');
    if (!orders.length) {
      el.innerHTML = emptyState({
        title: 'No orders yet',
        message: "When buyers request your books, you'll see their requests here.",
      });
      return;
    }
    el.innerHTML = `
      ${paneHead('Orders Received', `${orders.length} order${orders.length === 1 ? '' : 's'} from buyers.`)}
      <div class="dash-table-wrap">
        <table class="dash-table">
          <thead>
            <tr>
              <th>Book</th>
              <th>Buyer</th>
              <th>Contact</th>
              <th>Status</th>
              <th>Requested</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${orders
              .map(
                (o) => `
              <tr>
                <td class="col-title"><a href="/book-detail.html?id=${o.book_id}">${escapeHtml(o.title)}</a></td>
                <td>${escapeHtml(o.buyer_name || '—')}</td>
                <td>${escapeHtml(o.buyer_phone || '—')}</td>
                <td>${statusPill(o.status)}</td>
                <td>${formatDate(o.created_at)}</td>
                <td class="col-actions">
                  ${o.status === 'pending' ? `
                    <button class="btn small ghost" data-status="completed" data-id="${o.id}">Mark Completed</button>
                    <button class="btn small danger" data-status="cancelled" data-id="${o.id}">Cancel</button>
                  ` : ''}
                </td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`;

    el.querySelectorAll('[data-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.dataset.status;
        if (newStatus === 'cancelled') {
          const ok = await confirmModal({
            title: 'Cancel this order?',
            message: 'The buyer will see that the order was cancelled.',
            confirmText: 'Cancel order',
            danger: true,
          });
          if (!ok) return;
        }
        btn.classList.add('btn-loading');
        try {
          await api(`/api/orders/${btn.dataset.id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus }),
          });
          toast(`Order ${newStatus}`, 'success', 1500);
          await loadOrdersReceived();
          await loadListings();
        } catch (err) {
          toast(err.message, 'error');
          btn.classList.remove('btn-loading');
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="dash-empty"><h3>Could not load orders</h3><p>${escapeHtml(err.message || 'Please try again.')}</p></div>`;
  }
}

// ---------- Purchases ----------
async function loadPurchases() {
  const el = $('#tab-purchases');
  if (!el) return;
  try {
    const { orders } = await api('/api/orders/my-purchases');
    if (!orders.length) {
      el.innerHTML = emptyState({
        title: 'No purchases yet',
        message: 'Books you request to buy will show up here.',
        cta: { href: '/index.html', label: 'Browse Books' },
      });
      return;
    }
    el.innerHTML = `
      ${paneHead('My Purchases', `${orders.length} order${orders.length === 1 ? '' : 's'} you've placed.`)}
      <div class="dash-table-wrap">
        <table class="dash-table">
          <thead>
            <tr>
              <th>Book</th>
              <th>Seller</th>
              <th>Price</th>
              <th>Status</th>
              <th>Requested</th>
            </tr>
          </thead>
          <tbody>
            ${orders
              .map(
                (o) => `
              <tr>
                <td class="col-title"><a href="/book-detail.html?id=${o.book_id}">${escapeHtml(o.title)}</a></td>
                <td>${escapeHtml(o.seller_name || '—')}</td>
                <td class="col-price">${money(o.price)}</td>
                <td>${statusPill(o.status)}</td>
                <td>${formatDate(o.created_at)}</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="dash-empty"><h3>Could not load purchases</h3><p>${escapeHtml(err.message || 'Please try again.')}</p></div>`;
  }
}

// ---------- Wishlist (premium cards) ----------
async function loadWishlist() {
  const el = $('#tab-wishlist');
  if (!el) return;
  try {
    const { items } = await api('/api/wishlist');
    if (!items.length) {
      el.innerHTML = emptyState({
        title: 'Your wishlist is empty',
        message: "Save books you're interested in to find them here later.",
        cta: { href: '/index.html', label: 'Discover Books' },
      });
      return;
    }
    el.innerHTML = `
      ${paneHead('Wishlist', `${items.length} saved book${items.length === 1 ? '' : 's'}.`)}
      <div class="grid">${items.map((b) => wishlistCard(b)).join('')}</div>`;

    el.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.classList.add('btn-loading');
        try {
          await api(`/api/wishlist/${btn.dataset.remove}`, { method: 'DELETE' });
          toast('Removed from wishlist', 'info', 1500);
          await loadWishlist();
        } catch (err) {
          toast(err.message, 'error');
          btn.classList.remove('btn-loading');
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="dash-empty"><h3>Could not load wishlist</h3><p>${escapeHtml(err.message || 'Please try again.')}</p></div>`;
  }
}

function wishlistCard(b) {
  const cond = String(b.condition_status || 'used').toLowerCase();
  const condSlug = cond.replace(/\s+/g, '-');
  const isSold = b.status === 'sold';
  const cover = b.image ? `style="background-image:url('${escapeHtml(b.image)}')"` : '';
  const sellerInitial = (b.seller_name || '?').trim().charAt(0).toUpperCase();
  const sellerUni = b.seller_university
    ? `· <span class="seller-uni">${escapeHtml(b.seller_university)}</span>`
    : '';
  const category = b.category || 'Book';
  return `
    <article class="book-card fade-up${isSold ? ' is-sold' : ''}" aria-labelledby="dash-card-${b.id}">
      <a class="card-link" href="/book-detail.html?id=${b.id}">
        <div class="thumb${b.image ? '' : ' no-cover'}" ${cover}>
          <span class="thumb-shine"></span>
          <span class="condition-badge condition-${condSlug}">${escapeHtml(cond)}</span>
          ${isSold ? '<span class="sold-stamp">Sold</span>' : ''}
          <div class="quick-actions">
            <span class="qa-pill"><span class="qa-ico">↗</span>Quick view</span>
          </div>
        </div>
      </a>
      <div class="info">
        <div class="info-row">
          <h3 id="dash-card-${b.id}">${escapeHtml(b.title)}</h3>
          <span class="cat-tag">${escapeHtml(category)}</span>
        </div>
        ${b.author ? `<p class="author">by ${escapeHtml(b.author)}</p>` : ''}
        <div class="seller-row">
          <span class="seller-avatar" aria-hidden="true">${escapeHtml(sellerInitial)}</span>
          <span class="seller-name">${escapeHtml(b.seller_name || 'Seller')}</span>
          ${sellerUni}
        </div>
        <div class="meta">
          <span class="price">${money(b.price)}</span>
          <button class="card-cta" data-remove="${b.wishlist_id}" type="button" aria-label="Remove ${escapeHtml(b.title)} from wishlist">Remove</button>
        </div>
      </div>
    </article>`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------
//  Tabs (with mobile select fallback)
// ---------------------------------------------------------------------
function setupTabs() {
  const bar = $('.tab-bar');
  const buttons = $$('.tab-btn');
  const selectWrap = $('.tab-select-wrap');
  const select = $('#tabSelect');
  const panels = $$('.tab-panel');

  const syncFromButton = (btn) => {
    const target = btn.dataset.tab;
    buttons.forEach((b) => {
      const on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach((p) => p.classList.toggle('active', p.id === `tab-${target}`));
    if (select && select.value !== target) select.value = target;
    if (selectWrap) selectWrap.hidden = !isMobile();
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => syncFromButton(btn));
  });

  if (select) {
    select.addEventListener('change', () => {
      const match = buttons.find((b) => b.dataset.tab === select.value);
      if (match) syncFromButton(match);
    });
  }

  // Update on resize so the select fallback matches viewport.
  let lastMobile = isMobile();
  window.addEventListener('resize', () => {
    const nowMobile = isMobile();
    if (nowMobile !== lastMobile) {
      lastMobile = nowMobile;
      if (selectWrap) selectWrap.hidden = !nowMobile;
    }
  });
}

function isMobile() {
  return window.matchMedia('(max-width: 760px)').matches;
}

// ---------------------------------------------------------------------
//  Orchestration
// ---------------------------------------------------------------------
async function refreshAll() {
  // Kick all four in parallel — but tolerate individual failures.
  const [listingsRes, ordersRes, purchasesRes, wishlistRes] = await Promise.allSettled([
    api('/api/books/mine/list'),
    api('/api/orders/received'),
    api('/api/orders/my-purchases'),
    api('/api/wishlist'),
  ]);

  const listings = listingsRes.status === 'fulfilled' ? listingsRes.value.books || [] : [];
  const orders = ordersRes.status === 'fulfilled' ? ordersRes.value.orders || [] : [];
  const purchases = purchasesRes.status === 'fulfilled' ? purchasesRes.value.orders || [] : [];
  const wishlist = wishlistRes.status === 'fulfilled' ? wishlistRes.value || { items: [] } : { items: [] };

  const revenue = purchases
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + Number(p.price || 0), 0);

  renderKpis({ listings, orders, purchases, wishlist, revenue });
  renderDonut(listings);
  renderBarChart(orders, purchases);
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await initLayout();
  if (!user) {
    window.location.href = '/login.html';
    return;
  }
  renderHero(user);
  setupTabs();

  // Charts/KPIs from aggregate data.
  await refreshAll();

  // Tab renderers (independent).
  await Promise.allSettled([
    loadListings(),
    loadOrdersReceived(),
    loadPurchases(),
    loadWishlist(),
  ]);
});
