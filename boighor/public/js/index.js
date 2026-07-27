// index.js — homepage: book grid + filter/sort + hero stats

const SKELETON_COUNT = 8;
let firstLoad = true;          // skeletons only on the very first render
let lastQueryToken = 0;        // race-safe request token

// ---------- Skeleton placeholder ----------
function renderSkeletons() {
  const grid = document.getElementById('bookGrid');
  const empty = document.getElementById('emptyState');
  empty.style.display = 'none';
  grid.innerHTML = Array.from({ length: SKELETON_COUNT }).map(() => `
    <div class="book-card skeleton" aria-hidden="true">
      <div class="thumb sk-block"></div>
      <div class="info">
        <div class="sk-line sk-line-lg"></div>
        <div class="sk-line sk-line-sm"></div>
        <div class="sk-line sk-line-xs"></div>
      </div>
    </div>
  `).join('');
}

// ---------- Filter chips ----------
function renderChips(filters) {
  const host = document.getElementById('activeChips');
  if (!host) return;
  const chips = [];
  if (filters.q)        chips.push({ key: 'q', label: `"${filters.q}"` });
  if (filters.category) chips.push({ key: 'category', label: filters.category });
  if (filters.condition_status) chips.push({ key: 'condition_status', label: filters.condition_status });
  if (filters.minPrice) chips.push({ key: 'minPrice', label: `≥ Tk ${filters.minPrice}` });
  if (filters.maxPrice) chips.push({ key: 'maxPrice', label: `≤ Tk ${filters.maxPrice}` });
  if (filters.sort && filters.sort !== 'newest') {
    const sortLabels = { price_asc: 'Price ↑', price_desc: 'Price ↓', title: 'Title A→Z' };
    chips.push({ key: 'sort', label: sortLabels[filters.sort] || filters.sort });
  }
  if (!chips.length) { host.innerHTML = ''; return; }
  host.innerHTML = chips.map(c => `
    <button class="chip" data-chip="${c.key}">
      <span>${escapeHtml(c.label)}</span><span class="chip-x" aria-hidden="true">×</span>
    </button>
  `).join('');
  host.querySelectorAll('[data-chip]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.chip;
      const map = {
        q: 'fSearch', category: 'fCategory', condition_status: 'fCondition',
        minPrice: 'fMin', maxPrice: 'fMax', sort: 'fSort'
      };
      const el = document.getElementById(map[key]);
      if (el) el.value = (key === 'sort') ? 'newest' : '';
      loadBooks();
    });
  });
}

// ---------- Read all filter inputs ----------
function readFilters() {
  return {
    q:               document.getElementById('fSearch').value.trim(),
    category:        document.getElementById('fCategory').value,
    condition_status:document.getElementById('fCondition').value,
    minPrice:        document.getElementById('fMin').value,
    maxPrice:        document.getElementById('fMax').value,
    sort:            document.getElementById('fSort') ? document.getElementById('fSort').value : 'newest'
  };
}

// ---------- Hero stats (counts the catalog) ----------
async function loadHeroStats() {
  try {
    const data = await api('/api/books');
    const books = data.books || [];
    const total = books.length;
    const available = books.filter(b => b.status === 'available').length;
    const sellers = new Set(books.map(b => b.seller_id)).size;
    const booksEl   = document.getElementById('heroStatBooks');
    const studentsEl = document.getElementById('heroStatStudents');
    if (booksEl)    booksEl.textContent    = total > 0 ? total : '0';
    if (studentsEl) studentsEl.textContent = sellers > 0 ? sellers : '0';
  } catch (e) { /* non-fatal — leave placeholders */ }
}

// ---------- "Showing X books" meta line ----------
function setResultMeta(count, filters) {
  const meta = document.getElementById('resultMeta');
  if (!meta) return;
  const active = ['q', 'category', 'condition_status', 'minPrice', 'maxPrice'].some(k => filters[k]);
  if (active || count === 0) {
    meta.hidden = false;
    meta.textContent = count === 0
      ? 'No books match your filters.'
      : `Showing ${count} book${count === 1 ? '' : 's'}`;
  } else {
    meta.hidden = true;
    meta.textContent = '';
  }
}

// ---------- Main loader ----------
async function loadBooks() {
  const filters = readFilters();
  renderChips(filters);

  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });

  // Skeletons only on first ever load — subsequent re-queries keep visible content
  if (firstLoad) renderSkeletons();
  firstLoad = false;

  // Toggle the search-box spinner state
  const searchBox = document.getElementById('searchBox');
  if (searchBox) searchBox.dataset.loading = 'true';

  const myToken = ++lastQueryToken;
  let books = [];
  try {
    const data = await api('/api/books?' + params.toString());
    books = data.books || [];
  } catch (e) {
    books = [];
    if (searchBox) searchBox.dataset.loading = 'false';
  }
  // Ignore stale responses if the user re-filtered fast
  if (myToken !== lastQueryToken) {
    if (searchBox) searchBox.dataset.loading = 'false';
    return;
  }

  // Client-side sort (server may not yet support sort param)
  const sorted = [...books];
  if (filters.sort === 'price_asc')  sorted.sort((a, b) => a.price - b.price);
  if (filters.sort === 'price_desc') sorted.sort((a, b) => b.price - a.price);
  if (filters.sort === 'title')      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  const grid = document.getElementById('bookGrid');
  const empty = document.getElementById('emptyState');
  setResultMeta(sorted.length, filters);

  if (!sorted.length) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    if (searchBox) searchBox.dataset.loading = 'false';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = sorted.map((b, i) => {
    const liked = wishlistIds.has(Number(b.id));
    const conditionClass = b.condition_status ? escapeHtml(b.condition_status.toLowerCase().replace(/[^a-z0-9]+/g, '-')) : '';
    const initial = (escapeHtml(b.seller_name || 'B').trim()[0] || 'B').toUpperCase();
    const titleId = `card-${b.id}`;
    return `
    <article class="book-card fade-up${b.status === 'sold' ? ' is-sold' : ''}" style="animation-delay:${Math.min(i, 12) * 40}ms" aria-labelledby="${titleId}">
      <a class="card-link" href="/book-detail.html?id=${b.id}" aria-label="${escapeHtml(b.title)} by ${escapeHtml(b.author || 'unknown')}">
        <div class="thumb ${b.image ? '' : 'no-cover'}" ${b.image ? `style="background-image:url('${escapeHtml(b.image)}')"` : ''}>
          ${b.image ? '' : `<span class="thumb-placeholder">no cover</span>`}
          <span class="thumb-shine" aria-hidden="true"></span>
          ${b.condition_status ? `<span class="condition-badge condition-${conditionClass}">${escapeHtml(b.condition_status)}</span>` : ''}
          <button class="wishlist-btn${liked ? ' is-active' : ''}" type="button"
                  data-wishlist-toggle="${b.id}"
                  aria-pressed="${liked ? 'true' : 'false'}"
                  aria-label="${liked ? 'Remove from wishlist' : 'Add to wishlist'}"
                  title="${liked ? 'Remove from wishlist' : 'Add to wishlist'}">
            <svg class="heart-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21s-7.5-4.6-9.5-9.2C1.1 8.4 3 5 6.3 5c1.9 0 3.5 1 4.7 2.6C12.2 6 13.8 5 15.7 5 19 5 20.9 8.4 19.5 11.8 17.5 16.4 12 21 12 21z"/>
            </svg>
            <span class="wishlist-burst" aria-hidden="true">
              <span></span><span></span><span></span><span></span><span></span><span></span>
            </span>
          </button>
          ${b.status === 'sold' ? `<span class="sold-stamp">SOLD</span>` : ''}
          <div class="quick-actions" aria-hidden="true">
            <span class="qa-pill"><span class="qa-ico">↗</span> Quick view</span>
          </div>
        </div>
      </a>
      <div class="info">
        <div class="info-row">
          <h3 id="${titleId}" title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</h3>
          ${b.category ? `<span class="cat-tag">${escapeHtml(b.category)}</span>` : ''}
        </div>
        ${b.author ? `<div class="author">${escapeHtml(b.author)}</div>` : ''}
        <div class="seller-row">
          <span class="seller-avatar" aria-hidden="true">${initial}</span>
          <span class="seller-name">${escapeHtml(b.seller_name || 'Anonymous')}</span>
          ${b.seller_university ? `<span class="seller-uni">· ${escapeHtml(b.seller_university)}</span>` : ''}
        </div>
        <div class="meta">
          <span class="price">${money(b.price)}</span>
          <a class="card-cta" href="/book-detail.html?id=${b.id}" aria-label="View ${escapeHtml(b.title)}">View →</a>
        </div>
      </div>
    </article>
  `}).join('');

  // Stash the catalog for autocomplete (so suggestions reflect everything currently in the DB)
  latestBooks = sorted.slice();

  // Clear spinner (also on early returns — handled by finally above in caller paths)
  if (searchBox) searchBox.dataset.loading = 'false';
}

// Buffer of the latest book list — used to power autocomplete suggestions
let latestBooks = [];

// ---------- Clear filters ----------
function clearFilters() {
  ['fSearch', 'fCategory', 'fCondition', 'fMin', 'fMax'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const sort = document.getElementById('fSort');
  if (sort) sort.value = 'newest';
  loadBooks();
  toast('Filters cleared', 'info', 1500);
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  await initLayout();

  // Hook up controls
  document.getElementById('applyFilters').addEventListener('click', loadBooks);
  document.getElementById('clearFilters').addEventListener('click', clearFilters);

  // Live search — debounced
  const searchEl = document.getElementById('fSearch');
  searchEl.addEventListener('input', debounce(loadBooks, 280));
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); loadBooks(); }
  });

  // Price inputs — debounced (they don't deserve to spam the API)
  const debouncedReload = debounce(loadBooks, 320);
  ['fMin', 'fMax'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', debouncedReload);
      el.addEventListener('change', loadBooks); // instant refresh on blur/Enter
    }
  });

  // Other dropdowns — instant
  ['fCategory', 'fCondition', 'fSort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', loadBooks);
  });

  // Empty state actions
  const emptySell = document.getElementById('emptySellBtn');
  if (emptySell) emptySell.addEventListener('click', () => { window.location.href = '/sell.html'; });
  const emptyClear = document.getElementById('emptyClearBtn');
  if (emptyClear) emptyClear.addEventListener('click', clearFilters);

  // "/" keyboard shortcut to focus search
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      searchEl.focus();
    }
  });

  // ---- Premium card quick-actions: wishlist heart toggle ----
  const grid = document.getElementById('bookGrid');
  if (grid) {
    grid.addEventListener('click', async (e) => {
      const heart = e.target.closest('[data-wishlist-toggle]');
      if (!heart) return;
      e.preventDefault();
      e.stopPropagation();
      const bookId = Number(heart.dataset.wishlistToggle);
      if (!bookId) return;

      // Optimistic UI
      const wasActive = heart.classList.contains('is-active');
      heart.classList.toggle('is-active');
      heart.setAttribute('aria-pressed', wasActive ? 'false' : 'true');
      heart.setAttribute('aria-label', wasActive ? 'Add to wishlist' : 'Remove from wishlist');
      heart.title = wasActive ? 'Add to wishlist' : 'Remove from wishlist';
      if (!wasActive) {
        heart.classList.add('is-burst');
        setTimeout(() => heart.classList.remove('is-burst'), 600);
      }

      try {
        if (wasActive) {
          // Find the wishlist row id so we can DELETE
          const w = await api('/api/wishlist');
          const row = (w.items || []).find(x => Number(x.id) === bookId);
          if (row) await api('/api/wishlist/' + row.wishlist_id, { method: 'DELETE' });
          wishlistIds.delete(bookId);
        } else {
          await api('/api/wishlist', { method: 'POST', body: { book_id: bookId } });
          wishlistIds.add(bookId);
        }
      } catch (err) {
        // Roll back on failure (e.g. not logged in)
        heart.classList.toggle('is-active');
        heart.setAttribute('aria-pressed', wasActive ? 'true' : 'false');
        heart.setAttribute('aria-label', wasActive ? 'Remove from wishlist' : 'Add to wishlist');
        heart.title = wasActive ? 'Remove from wishlist' : 'Add to wishlist';
        toast(err.message || 'Could not update wishlist', 'error');
      }
    });
  }

  // ---- Boot ----
  loadBooks();
  loadHeroStats();
  initHeroParallax();
  setupSearchExperience();
  loadWishlistCache();
});

// Cache of book ids the current user has wishlisted — used to pre-fill hearts
const wishlistIds = new Set();

async function loadWishlistCache() {
  try {
    const me = await api('/api/auth/me');
    if (!me || !me.user) return;
    const w = await api('/api/wishlist');
    (w.items || []).forEach(b => wishlistIds.add(Number(b.id)));
  } catch {
    // Not logged in — leave hearts empty, click will prompt login via toast
  }
}

// ---------- Premium search experience (autocomplete + keyboard nav + chips + advanced toggle) ----------
function setupSearchExperience() {
  const box       = document.getElementById('searchBox');
  const input     = document.getElementById('fSearch');
  const clearBtn  = document.getElementById('searchClear');
  const suggest   = document.getElementById('searchSuggest');
  const chips     = document.getElementById('searchChips');
  const advanced  = document.getElementById('searchAdvanced');
  const advToggle = document.getElementById('advToggle');
  if (!box || !input || !suggest) return;

  // ---- helpers ----
  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const debounce = (fn, ms = 150) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  const coverFor = (b) => b.image
    ? `<div class="suggest-thumb" style="background-image:url('${escapeHtml(b.image)}')"></div>`
    : `<div class="suggest-thumb no-cover" aria-hidden="true"><span>${escapeHtml((b.title || '?').trim()[0] || 'B').toUpperCase()}</span></div>`;

  const highlight = (text, q) => {
    const t = escapeHtml(text);
    if (!q) return t;
    const idx = t.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return t;
    return t.slice(0, idx) + '<mark>' + t.slice(idx, idx + q.length) + '</mark>' + t.slice(idx + q.length);
  };

  const closeSuggest = () => {
    suggest.classList.remove('is-open');
    suggest.setAttribute('aria-hidden', 'true');
    input.setAttribute('aria-expanded', 'false');
  };

  const refreshClear = () => {
    if (!clearBtn) return;
    clearBtn.style.display = input.value.trim() ? 'inline-flex' : 'none';
  };

  // ---- suggestions ----
  const renderSuggestions = (query) => {
    const q = (query || '').trim();
    if (!q) { closeSuggest(); return; }
    const ql = q.toLowerCase();
    const matches = (Array.isArray(latestBooks) ? latestBooks : [])
      .filter(b => (b.title || '').toLowerCase().includes(ql) || (b.author || '').toLowerCase().includes(ql))
      .slice(0, 8);

    if (!matches.length) {
      suggest.innerHTML = `
        <div class="suggest-empty">
          <div class="suggest-empty-ico">∅</div>
          <div class="suggest-empty-title">No matches for "<strong>${escapeHtml(q)}</strong>"</div>
          <div class="suggest-empty-sub">Try a different keyword or browse by category.</div>
        </div>`;
      suggest.classList.add('is-open');
      suggest.setAttribute('aria-hidden', 'false');
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    const head = `
      <div class="suggest-head">
        <span>${matches.length} result${matches.length === 1 ? '' : 's'}</span>
        <span class="suggest-kbd"><kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>↵</kbd> open · <kbd>esc</kbd> close</span>
      </div>`;
    const rows = matches.map((b, i) => `
      <a class="suggest-item" href="/book-detail.html?id=${b.id}" data-i="${i}" role="option">
        ${coverFor(b)}
        <div class="suggest-body">
          <div class="suggest-title">${highlight(b.title || 'Untitled', q)}</div>
          ${b.author ? `<div class="suggest-author">by ${highlight(b.author, q)}</div>` : ''}
          <div class="suggest-meta">
            ${b.category ? `<span class="suggest-cat">${escapeHtml(b.category)}</span>` : ''}
            <span class="suggest-price">৳ ${Number(b.price || 0).toLocaleString()}</span>
          </div>
        </div>
        <span class="suggest-arrow" aria-hidden="true">↵</span>
      </a>`).join('');
    const foot = `<div class="suggest-foot">Press <kbd>↵</kbd> to search the full catalog</div>`;

    suggest.innerHTML = head + rows + foot;
    suggest.classList.add('is-open');
    suggest.setAttribute('aria-hidden', 'false');
    input.setAttribute('aria-expanded', 'true');
  };

  const debouncedSuggest = debounce((q) => renderSuggestions(q), 120);

  // ---- input ----
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'searchSuggest');
  input.setAttribute('aria-expanded', 'false');

  input.addEventListener('focus', () => {
    box.dataset.focus = 'true';
    if (input.value.trim()) renderSuggestions(input.value);
  });
  input.addEventListener('blur', () => {
    // Delay so click on a suggestion still registers
    setTimeout(() => box.dataset.focus = 'false', 80);
  });
  input.addEventListener('input', () => {
    refreshClear();
    debouncedSuggest(input.value);
  });

  // ---- keyboard nav on the input ----
  input.addEventListener('keydown', (e) => {
    const items = suggest.querySelectorAll('.suggest-item');
    if (e.key === 'ArrowDown') {
      if (!items.length) return;
      e.preventDefault();
      const active = suggest.querySelector('.suggest-item.is-active');
      const idx = active ? Number(active.dataset.i) : -1;
      const next = items[(idx + 1) % items.length];
      items.forEach(el => el.classList.remove('is-active'));
      next.classList.add('is-active');
      next.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      const active = suggest.querySelector('.suggest-item.is-active');
      const idx = active ? Number(active.dataset.i) : items.length;
      const prev = items[(idx - 1 + items.length) % items.length];
      items.forEach(el => el.classList.remove('is-active'));
      prev.classList.add('is-active');
      prev.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      const active = suggest.querySelector('.suggest-item.is-active');
      if (active) {
        e.preventDefault();
        input.value = active.querySelector('.suggest-title')?.textContent || input.value;
        closeSuggest();
        refreshClear();
        loadBooks();
      } else {
        // No highlighted suggestion: treat Enter as "run this query"
        e.preventDefault();
        closeSuggest();
        loadBooks();
      }
    } else if (e.key === 'Escape') {
      closeSuggest();
    }
  });

  // ---- click suggestion (delegated) ----
  suggest.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.suggest-item');
    if (!item) return;
    // Use mousedown so we beat the blur handler
    e.preventDefault();
    input.value = item.querySelector('.suggest-title')?.textContent || input.value;
    closeSuggest();
    refreshClear();
    loadBooks();
  });

  // ---- click outside to close ----
  document.addEventListener('click', (e) => {
    if (!box.contains(e.target)) closeSuggest();
  });

  // ---- clear button ----
  refreshClear();
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      input.focus();
      refreshClear();
      closeSuggest();
      loadBooks();
    });
  }

  // ---- quick-filter chips ----
  if (chips) {
    const applyChip = (chip) => {
      const cat = chip.dataset.cat || '';
      chips.querySelectorAll('.chip-tab').forEach(c => c.classList.toggle('is-active', c === chip));
      const fCategory = document.getElementById('fCategory');
      if (fCategory) fCategory.value = cat;
      // If a category was picked, open the advanced panel so the user sees the active filter
      if (cat && advanced && advanced.dataset.open !== 'true') {
        advanced.dataset.open = 'true';
        if (advToggle) advToggle.setAttribute('aria-expanded', 'true');
      }
      closeSuggest();
      loadBooks();
    };
    chips.querySelectorAll('.chip-tab').forEach(chip => {
      chip.addEventListener('click', () => applyChip(chip));
    });
  }

  // ---- advanced toggle ----
  if (advanced && advToggle) {
    advToggle.addEventListener('click', () => {
      const open = advanced.dataset.open === 'true';
      advanced.dataset.open = open ? 'false' : 'true';
      advToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  }
}

// ---------- Hero parallax (subtle scroll-driven translation) ----------
function initHeroParallax() {
  const hero = document.getElementById('hero');
  if (!hero) return;
  const layers = hero.querySelectorAll('[data-parallax]');
  if (!layers.length) return;

  // Only run on devices that actually want motion
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const rect = hero.getBoundingClientRect();
      const heroH = rect.height || 1;
      // 0 when hero top is at viewport top, 1 when hero bottom hits viewport bottom
      const progress = Math.min(1, Math.max(0, -rect.top / (heroH * 0.6)));
      layers.forEach(el => {
        const speed = parseFloat(el.dataset.parallax) || 0.2;
        const y = progress * speed * 80; // max 80px translate
        el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      });
      ticking = false;
    });
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
}
