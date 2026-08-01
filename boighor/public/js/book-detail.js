// public/js/book-detail.js
// Renders the modern book-detail page:
//   - hero (gallery + sticky buy card + title block + meta)
//   - description section
//   - seller profile
//   - reviews (summary histogram + form + list)
//   - related books (reuses the homepage .book-card markup)
//
// Backed by:
//   GET    /api/books/:id      -> { book, reviews }
//   GET    /api/books          -> related (filters by category, excludes self)
//   POST   /api/orders         -> buy request
//   POST   /api/wishlist       -> add
//   DELETE /api/wishlist/:id   -> remove
//   GET    /api/wishlist       -> load cache (used to reflect heart state)
//   POST   /api/reviews        -> submit review { seller_id, rating, comment }

(() => {
  'use strict';

  // ---- State ----
  let bookId = null;
  let book = null;             // {id, title, author, ..., seller_id, seller_name, ...}
  let reviews = [];            // [{id, reviewer_id, rating, comment, created_at, reviewer_name}]
  let currentUser = null;
  const wishlistIds = new Set(); // local cache of wishlisted book ids

  // ---- Element refs ----
  const $skel   = () => document.getElementById('bdSkeleton');
  const $content = () => document.getElementById('bdContent');
  const $error  = () => document.getElementById('bdError');

  // ---------- Helpers ----------
  function starString(avg) {
    const r = Math.round(avg);
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z'));
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString('en-BD', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) { return iso; }
  }
  function avgOf(list) {
    if (!list.length) return 0;
    return list.reduce((s, r) => s + Number(r.rating || 0), 0) / list.length;
  }
  function bookCardHtml(b, i = 0) {
    // Reuses the same premium card markup as index.js for visual consistency.
    const liked = wishlistIds.has(Number(b.id));
    const conditionClass = b.condition_status
      ? escapeHtml(b.condition_status.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
      : '';
    const initial = (escapeHtml(b.seller_name || 'B').trim()[0] || 'B').toUpperCase();
    const titleId = `bd-rel-${b.id}`;
    return `
    <article class="book-card fade-up${b.status === 'sold' ? ' is-sold' : ''}" style="animation-delay:${Math.min(i, 12) * 40}ms" aria-labelledby="${titleId}">
      <a class="card-link" href="/book-detail.html?id=${b.id}" aria-label="${escapeHtml(b.title)} by ${escapeHtml(b.author || 'unknown')}">
        <div class="thumb ${b.image ? '' : 'no-cover'}" ${b.image ? `style="background-image:url('${escapeHtml(b.image)}')"` : ''}>
          ${b.image ? '' : `<span class="thumb-placeholder">no cover</span>`}
          <span class="thumb-shine" aria-hidden="true"></span>
          ${b.condition_status ? `<span class="condition-badge condition-${conditionClass}">${escapeHtml(b.condition_status)}</span>` : ''}
          ${b.status === 'sold' ? `<span class="sold-stamp">SOLD</span>` : ''}
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
    </article>`;
  }

  // ---------- Data loading ----------
  async function loadWishlistCache() {
    if (!currentUser) return;
    try {
      const data = await api('/api/wishlist');
      (data.items || []).forEach(it => wishlistIds.add(Number(it.id)));
    } catch (_) { /* not logged in or empty */ }
  }

  async function loadBook() {
    const data = await api('/api/books/' + bookId);
    book = data.book;
    reviews = Array.isArray(data.reviews) ? data.reviews : [];
  }

  async function loadRelated() {
    try {
      // Try same category first; if empty, fall back to the broader catalog.
      let list = [];
      if (book.category) {
        const r = await api('/api/books?category=' + encodeURIComponent(book.category));
        list = (r.books || []).filter(b => Number(b.id) !== Number(book.id));
      }
      if (!list.length) {
        const r = await api('/api/books');
        list = (r.books || []).filter(b => Number(b.id) !== Number(book.id));
      }
      return list.slice(0, 4);
    } catch (_) { return []; }
  }

  // ---------- Render: hero ----------
  function renderHero() {
  // Compose the hero region (gallery + title block + meta row + sticky buy card)
  // — public alias for the modular renderers.
  return `
    <section class="bd-hero" aria-label="Book overview">
      ${renderCrumbs()}
      <div class="bd-grid">
        <div class="bd-gallery">${renderGallery()}</div>
        <div class="bd-info">
          ${renderTitleBlock()}
          ${renderMetaRow()}
          ${renderActionRow()}
        </div>
        <aside class="bd-sticky" aria-label="Buy this book">
          ${renderStickyBuy()}
        </aside>
      </div>
    </section>
  `;
}
function renderActionRow() {
  // The inline action row inside the info column (Buy / Wishlist / Message).
  // The sticky buy card on the right has its own .bd-action-row.
  return `
    <div class="bd-action-row bd-action-row--inline">
      <button class="btn primary bd-buy-btn"  type="button" data-act="buy">Buy now</button>
      <button class="btn ghost   bd-wish-btn"  type="button" data-act="wish"
              aria-pressed="false" aria-label="Save to wishlist">
        <span class="bd-wish-icon" aria-hidden="true">♡</span>
        <span class="bd-wish-label">Save</span>
      </button>
      <button class="btn outline bd-msg-btn"   type="button" data-act="msg">Message seller</button>
    </div>
  `;
}
function renderCrumbs() {
    const host = document.getElementById('bdCrumbs');
    if (!host) return;
    const cat = book.category ? escapeHtml(book.category) : 'Books';
    host.innerHTML = `
      <a href="/">Home</a>
      <span class="bd-crumb-sep" aria-hidden="true">/</span>
      <a href="/?category=${encodeURIComponent(book.category || '')}">${cat}</a>
      <span class="bd-crumb-sep" aria-hidden="true">/</span>
      <span class="bd-crumb-current">${escapeHtml(book.title)}</span>
    `;
  }

  function renderGallery() {
    const main = document.getElementById('bdMainImage');
    const thumbs = document.getElementById('bdThumbs');
    if (!main || !thumbs) return;
    if (book.image) {
      main.innerHTML = `
        <img src="${escapeHtml(book.image)}" alt="${escapeHtml(book.title)}">
        <span class="bd-zoom-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </span>`;
    } else {
      const initial = (book.title || '?').trim()[0].toUpperCase();
      main.innerHTML = `
        <div class="bd-placeholder no-cover">
          <span class="thumb-placeholder">No cover</span>
        </div>`;
    }
    // Decorative thumb strip: cover + Spine / Back / Edge placeholders
    const items = book.image
      ? [
          { src: book.image, label: 'Cover', isPlaceholder: false },
          { label: 'Spine', isPlaceholder: true },
          { label: 'Back', isPlaceholder: true },
          { label: 'Edge', isPlaceholder: true },
        ]
      : [
          { label: 'Front', isPlaceholder: true },
          { label: 'Spine', isPlaceholder: true },
          { label: 'Back', isPlaceholder: true },
          { label: 'Edge', isPlaceholder: true },
        ];
    thumbs.innerHTML = items.map((it, idx) => it.isPlaceholder
      ? `<button class="bd-thumb is-placeholder" type="button" data-thumb="${idx}" aria-label="${escapeHtml(it.label)} view">${escapeHtml(it.label)}</button>`
      : `<button class="bd-thumb is-active" type="button" data-thumb="${idx}" aria-label="${escapeHtml(it.label)} view">
           <img src="${escapeHtml(it.src)}" alt="${escapeHtml(book.title)} — ${escapeHtml(it.label)}">
         </button>`
    ).join('');
    setupGallery();
  }

  function renderTitleBlock() {
    document.getElementById('bdEyebrow').innerHTML = `
      <span class="bd-cat-dot" aria-hidden="true"></span>
      ${escapeHtml(book.category || 'Book')}
    `;
    document.getElementById('bdTitle').textContent = book.title;
    document.getElementById('bdAuthor').textContent = book.author ? `by ${book.author}` : '';
  }

  function renderMetaRow() {
    const avg = avgOf(reviews);
    const meta = document.getElementById('bdMeta');
    const condClass = (book.condition_status || '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-');
    meta.innerHTML = `
      <span class="bd-stars" aria-label="${avg.toFixed(1)} out of 5">
        ${starString(avg)}
        <span class="bd-stars-count">${avg ? avg.toFixed(1) : '—'} · ${reviews.length} review${reviews.length === 1 ? '' : 's'}</span>
      </span>
      ${book.condition_status ? `<span class="bd-meta-chip">Condition: <strong>${escapeHtml(book.condition_status)}</strong></span>` : ''}
      <span class="bd-status-pill bd-status--${escapeHtml((book.status || 'available').toLowerCase())}">${escapeHtml(book.status || 'available')}</span>
      <span class="bd-meta-chip" title="Listed on ${fmtDate(book.created_at)}">Listed ${fmtDate(book.created_at)}</span>
    `;
  }

  function renderStickyBuy() {
    const host = document.getElementById('bdBuyCard');
    if (!host) return;
    const isOwner = currentUser && currentUser.id === book.seller_id;
    const isAvailable = (book.status || 'available') === 'available';
    const liked = wishlistIds.has(Number(book.id));

    // Price + hint
    let priceHtml = `
      <div class="bd-price-row">
        <span class="bd-price">${money(book.price)}</span>
        <span class="bd-price-hint">Cash on meetup<br><small>Free pickup in campus</small></span>
      </div>`;

    // Action buttons
    let actions = '';
    if (!currentUser) {
      actions = `
        <div class="bd-action-row">
          <a class="btn primary bd-buy-btn" href="/login.html">Login to buy</a>
          <button class="bd-wish-btn" type="button" disabled title="Login to save">
            <svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.5-9.2C1.1 8.4 3 5 6.3 5c1.9 0 3.5 1 4.7 2.6C12.2 6 13.8 5 15.7 5 19 5 20.9 8.4 19.5 11.8 17.5 16.4 12 21 12 21z"/></svg>
            Save
          </button>
          <button class="bd-msg-btn" type="button" disabled title="Login to message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>
            Message
          </button>
        </div>`;
    } else if (isOwner) {
      actions = `
        <div class="bd-action-row">
          <a class="btn primary bd-buy-btn" href="/dashboard.html">Manage in dashboard</a>
        </div>`;
    } else if (!isAvailable) {
      actions = `
        <div class="bd-action-row">
          <button class="btn bd-buy-btn" type="button" disabled>Already ${escapeHtml(book.status)}</button>
        </div>`;
    } else {
      actions = `
        <div class="bd-action-row">
          <button class="btn primary bd-buy-btn" id="bdBuyBtn" type="button">Request to buy</button>
          <button class="bd-wish-btn${liked ? ' is-active' : ''}" id="bdWishBtn" type="button"
                  aria-pressed="${liked ? 'true' : 'false'}">
            <svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.5-9.2C1.1 8.4 3 5 6.3 5c1.9 0 3.5 1 4.7 2.6C12.2 6 13.8 5 15.7 5 19 5 20.9 8.4 19.5 11.8 17.5 16.4 12 21 12 21z"/></svg>
            ${liked ? 'Saved' : 'Save'}
          </button>
          <button class="bd-msg-btn" id="bdMsgOpenBtn" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>
            Message
          </button>
        </div>`;
    }

    const meta = `
      <div class="bd-buy-meta">
        <div class="bd-buy-meta-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Pickup on campus · ships locally
        </div>
        <div class="bd-buy-meta-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Listed ${fmtDate(book.created_at)}
        </div>
      </div>`;

    host.innerHTML = priceHtml + actions + meta;

    // Wire actions
    const buyBtn = document.getElementById('bdBuyBtn');
    if (buyBtn) buyBtn.addEventListener('click', handleBuy);
    const wishBtn = document.getElementById('bdWishBtn');
    if (wishBtn) wishBtn.addEventListener('click', handleWishlist);
    const msgBtn = document.getElementById('bdMsgOpenBtn');
    if (msgBtn) msgBtn.addEventListener('click', openMessageSeller);
  }

  function renderDescription() {
    const host = document.getElementById('bdDesc');
    host.innerHTML = book.description
      ? `<p class="bd-desc-text">${escapeHtml(book.description)}</p>`
      : `<p class="bd-desc-text" style="color:var(--ink-faint);font-style:italic;">No description provided by the seller.</p>`;
    const tags = document.getElementById('bdTags');
    const list = [
      book.category, book.condition_status,
      book.author ? `By ${book.author}` : null,
    ].filter(Boolean);
    tags.innerHTML = list.map(t => `<span class="bd-tag">${escapeHtml(t)}</span>`).join('');
  }

  function renderSeller() {
    const host = document.getElementById('bdSellerProfile');
    const initial = (book.seller_name || '?').trim()[0].toUpperCase();
    const avg = avgOf(reviews);
    const isOwner = currentUser && currentUser.id === book.seller_id;
    const msgBtn = (currentUser && !isOwner)
      ? `<button class="btn primary" type="button" id="bdSellerMsgBtn">Message seller</button>`
      : '';
    host.innerHTML = `
      <div class="bd-seller-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
      <div class="bd-seller-head">
        <span class="bd-seller-name">${escapeHtml(book.seller_name || 'Anonymous')}</span>
        ${book.seller_university ? `<span class="bd-seller-uni">${escapeHtml(book.seller_university)}</span>` : ''}
        <div class="bd-seller-stats">
          <span class="bd-seller-stat">
            <span class="bd-stat-ico" aria-hidden="true">★</span>
            <strong data-countup="${avg ? avg.toFixed(1) : '0'}" data-countup-decimals="1">${avg ? avg.toFixed(1) : '—'}</strong>
            <span>(<span data-countup="${reviews.length}">${reviews.length}</span> review${reviews.length === 1 ? '' : 's'})</span>
          </span>
          <span class="bd-seller-stat">
            <span class="bd-stat-ico" aria-hidden="true">✓</span>
            <span>Verified student</span>
          </span>
        </div>
      </div>
      <div class="bd-seller-actions">${msgBtn}</div>
    `;
    const btn = document.getElementById('bdSellerMsgBtn');
    if (btn) btn.addEventListener('click', openMessageSeller);
  }

  // ---------- Reviews ----------
  function renderReviews() {
    const avg = avgOf(reviews);
    // Histogram counts per star (5 → 1)
    const counts = [5, 4, 3, 2, 1].map(s => reviews.filter(r => Math.round(Number(r.rating)) === s).length);
    const total = reviews.length;
    const summary = document.getElementById('bdReviewSummary');
    summary.innerHTML = `
      <div class="bd-review-avg">
        <div class="bd-review-avg-num">${avg ? avg.toFixed(1) : '—'}</div>
        <div class="bd-review-avg-stars" aria-hidden="true">${starString(avg || 0)}</div>
        <div class="bd-review-avg-meta">${total} review${total === 1 ? '' : 's'} for this seller</div>
      </div>
      <div class="bd-hist">
        ${counts.map((c, i) => {
          const star = 5 - i;
          const pct = total ? (c / total) * 100 : 0;
          return `
            <div class="bd-hist-row">
              <span class="bd-hist-label">${star}★</span>
              <span class="bd-hist-track"><span class="bd-hist-bar" style="width:${pct.toFixed(1)}%"></span></span>
              <span class="bd-hist-count">${c}</span>
            </div>`;
        }).join('')}
      </div>
    `;

    // Form slot
    const formWrap = document.getElementById('bdReviewFormWrap');
    const isOwner = currentUser && currentUser.id === book.seller_id;
    if (!currentUser) {
      formWrap.innerHTML = `
        <div class="bd-review-promote">
          <strong>Have you bought from this seller?</strong>
          <p>Login to leave a review and help other students.</p>
          <a class="btn primary" href="/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}">Login to review</a>
        </div>`;
    } else if (isOwner) {
      formWrap.innerHTML = `
        <div class="bd-review-promote">
          <strong>You can't review your own listing.</strong>
          <p>Reviews come from buyers who actually transact with you.</p>
        </div>`;
    } else {
      const alreadyReviewed = reviews.some(r => Number(r.reviewer_id) === Number(currentUser.id));
      if (alreadyReviewed) {
        formWrap.innerHTML = `
          <div class="bd-review-promote">
            <strong>Thanks — you've already reviewed this seller.</strong>
            <p>Your review helps other students choose confidently.</p>
          </div>`;
      } else {
        formWrap.innerHTML = `
          <h3 class="bd-review-form-title">Rate this seller</h3>
          <p class="bd-review-form-sub">Your review helps other students choose confidently.</p>
          <form class="bd-review-form" id="bdReviewForm" novalidate>
            <div class="bd-review-form-grid">
              <div class="field">
                <label class="field-label" for="bdRating">Rating</label>
                <select id="bdRating" class="field-input">
                  <option value="5">★★★★★ Excellent</option>
                  <option value="4">★★★★☆ Good</option>
                  <option value="3">★★★☆☆ Okay</option>
                  <option value="2">★★☆☆☆ Poor</option>
                  <option value="1">★☆☆☆☆ Bad</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="bdComment">Comment</label>
                <textarea id="bdComment" class="field-textarea" rows="4" placeholder="How was your experience with this seller?"></textarea>
              </div>
            </div>
            <div class="bd-review-form-actions">
              <button class="btn primary" type="submit">Submit review</button>
              <span class="bd-review-form-msg" id="bdReviewMsg" role="status" aria-live="polite"></span>
            </div>
          </form>`;
        const form = document.getElementById('bdReviewForm');
        form.addEventListener('submit', submitReview);
      }
    }

    // List
    const list = document.getElementById('bdReviewList');
    if (!reviews.length) {
      list.innerHTML = `
        <div class="bd-review-promote" style="grid-column:1/-1;">
          <strong>No reviews yet.</strong>
          <p>Be the first to leave a review for this seller.</p>
        </div>`;
      return;
    }
    list.innerHTML = reviews.map(r => {
      const ini = (r.reviewer_name || '?').trim()[0].toUpperCase();
      return `
        <article class="bd-review-card">
          <div class="bd-review-card-head">
            <span class="bd-review-avatar" aria-hidden="true">${escapeHtml(ini)}</span>
            <div class="bd-review-author">
              <strong>${escapeHtml(r.reviewer_name || 'Anonymous')}</strong>
              <span class="bd-review-date">${escapeHtml(fmtDate(r.created_at))}</span>
            </div>
            <span class="bd-review-stars" aria-label="${r.rating} of 5">${starString(r.rating)}</span>
          </div>
          ${r.comment ? `<p class="bd-review-comment">${escapeHtml(r.comment)}</p>` : ''}
        </article>`;
    }).join('');
  }

  async function submitReview(e) {
    e.preventDefault();
    const msg = document.getElementById('bdReviewMsg');
    const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
    if (msg) { msg.className = 'bd-review-form-msg'; msg.textContent = ''; }
    if (submitBtn) { submitBtn.classList.add('btn-loading'); submitBtn.disabled = true; }
    try {
      await api('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          seller_id: book.seller_id,
          rating: Number(document.getElementById('bdRating').value),
          comment: document.getElementById('bdComment').value || '',
        }),
      });
      if (msg) {
        msg.textContent = 'Thanks! Your review is live.';
        msg.classList.add('is-success');
      }
      toast('Review submitted!', 'success');
      await loadBook();
      renderReviews();
    } catch (err) {
      if (msg) {
        msg.textContent = err.message || 'Could not submit review.';
        msg.classList.add('is-error');
      }
      toast(err.message, 'error');
      if (submitBtn) { submitBtn.classList.remove('btn-loading'); submitBtn.disabled = false; }
    }
  }

  // ---------- Buy / Wishlist ----------
  async function handleBuy(ev) {
    const btn = ev.currentTarget;
    btn.classList.add('btn-loading');
    btn.disabled = true;
    try {
      await api('/api/orders', { method: 'POST', body: JSON.stringify({ book_id: book.id }) });
      toast('Request sent! The seller will contact you to arrange the exchange.', 'success', 4500);
      btn.textContent = '✓ Request sent';
      btn.classList.remove('primary');
      btn.classList.add('ghost');
    } catch (err) {
      toast(err.message, 'error');
      btn.classList.remove('btn-loading');
      btn.disabled = false;
    }
  }

  // Public alias matching the index.js / wishlist toggle naming convention.
  // Looks up the wishlist button(s) on the page and forwards to handleWishlist.
  async function toggleWishlist(bookId) {
    const btn = document.querySelector('[data-act="wish"]');
    if (!btn) return;
    return handleWishlist({ stopPropagation() {}, preventDefault() {}, currentTarget: btn }, bookId);
  }
  async function handleWishlist(ev) {
    const btn = ev.currentTarget;
    const id = Number(book.id);
    const wasLiked = wishlistIds.has(id);
    btn.disabled = true;
    try {
      if (wasLiked) {
        // Find wishlist row id by reading current wishlist
        const data = await api('/api/wishlist');
        const row = (data.items || []).find(it => Number(it.id) === id);
        if (row && row.wishlist_id) {
          await api(`/api/wishlist/${row.wishlist_id}`, { method: 'DELETE' });
        }
        wishlistIds.delete(id);
        btn.classList.remove('is-active');
        btn.querySelector('span:last-child') && (btn.lastChild.nodeValue = ' Save');
        btn.textContent = btn.textContent.replace('Saved', 'Save');
        btn.setAttribute('aria-pressed', 'false');
        toast('Removed from wishlist.', 'info', 1800);
      } else {
        await api('/api/wishlist', { method: 'POST', body: JSON.stringify({ book_id: id }) });
        wishlistIds.add(id);
        btn.classList.add('is-active');
        btn.textContent = btn.textContent.replace('Save', 'Saved');
        btn.setAttribute('aria-pressed', 'true');
        toast('Added to wishlist!', 'success', 1800);
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      // Re-sync label cleanly
      const stillLiked = wishlistIds.has(id);
      btn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.5-9.2C1.1 8.4 3 5 6.3 5c1.9 0 3.5 1 4.7 2.6C12.2 6 13.8 5 15.7 5 19 5 20.9 8.4 19.5 11.8 17.5 16.4 12 21 12 21z"/></svg>
        ${stillLiked ? 'Saved' : 'Save'}`;
      btn.classList.toggle('is-active', stillLiked);
      btn.setAttribute('aria-pressed', stillLiked ? 'true' : 'false');
      // One-shot heart pop animation (CSS handles this — class is added then removed)
      btn.classList.remove('is-popping'); void btn.offsetWidth; btn.classList.add('is-popping');
      setTimeout(() => btn.classList.remove('is-popping'), 520);
    }
  }

  // ---------- Gallery / Lightbox ----------
  function setupGallery() {
    const main = document.getElementById('bdMainImage');
    const thumbs = document.querySelectorAll('#bdThumbs .bd-thumb');
    if (!main) return;

    // Make the main image keyboard-focusable so it has a visible :focus-visible ring.
    main.setAttribute('tabindex', '0');
    main.setAttribute('role', 'button');
    if (book.image) main.setAttribute('aria-label', `Open enlarged view of ${book.title}`);

    if (thumbs.length) {
      thumbs.forEach(btn => btn.addEventListener('click', () => {
        thumbs.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        // For placeholder tiles we just re-show the main image; for the real cover tile we do nothing.
        if (btn.querySelector('img')) {
          const img = btn.querySelector('img');
          // Crossfade-swap the main image (see CSS .is-swapping)
          const mainImg = main.querySelector('img');
          if (mainImg) {
            mainImg.classList.add('is-swapping');
            setTimeout(() => { mainImg.src = img.src; mainImg.classList.remove('is-swapping'); }, 160);
            // GSAP: small scale punch on the main image (only if GSAP loaded)
            if (window.gsap) {
              const prefersReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              if (!prefersReduce) {
                gsap.fromTo(mainImg, { scale: 1.04 }, { scale: 1, duration: 0.5, ease: 'power2.out' });
              }
            }
          }
        }
      }));
    }

    main.addEventListener('click', () => {
      if (book.image) openLightbox(book.image, book.title);
    });
    main.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && book.image) {
        e.preventDefault();
        openLightbox(book.image, book.title);
      }
    });

    // Sticky-buy-card elevation when the user scrolls past the gallery
    const sticky = document.querySelector('.bd-sticky');
    if (sticky && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => sticky.classList.toggle('is-stuck', !e.isIntersecting && e.boundingClientRect.top < 0));
      }, { threshold: 0, rootMargin: '-100px 0px 0px 0px' });
      io.observe(main);
    }

    // Histogram bars: re-trigger animation when summary enters view
    if ('IntersectionObserver' in window) {
      const hist = document.getElementById('bdReviewSummary');
      if (hist) {
        const io2 = new IntersectionObserver((entries) => {
          entries.forEach(e => {
            if (e.isIntersecting) {
              hist.querySelectorAll('.bd-hist-bar').forEach(b => b.classList.add('is-visible'));
              io2.unobserve(hist);
            }
          });
        }, { threshold: 0.2 });
        io2.observe(hist);
      }
    }

    // GSAP: seller-profile stats count-up when section enters view
    if (window.gsap && 'IntersectionObserver' in window) {
      const seller = document.getElementById('bdSellerProfile');
      if (seller) {
        const io3 = new IntersectionObserver((entries) => {
          entries.forEach(e => {
            if (e.isIntersecting) {
              seller.querySelectorAll('[data-countup]').forEach(el => {
                const target = Number(el.dataset.countup || 0);
                const decimals = Number(el.dataset.countupDecimals || 0);
                const prefersReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                if (prefersReduce) { el.textContent = target.toFixed(decimals); return; }
                const obj = { v: 0 };
                gsap.to(obj, {
                  v: target, duration: 0.9, ease: 'power2.out',
                  onUpdate: () => { el.textContent = obj.v.toFixed(decimals); }
                });
              });
              io3.unobserve(seller);
            }
          });
        }, { threshold: 0.3 });
        io3.observe(seller);
      }
    }
  }

  function openLightbox(src, title) {
    const box = document.getElementById('bdLightbox');
    const img = document.getElementById('bdLightboxImg');
    const cap = document.getElementById('bdLightboxCaption');
    if (!box || !img) return;
    img.src = src;
    img.alt = title || '';
    cap.textContent = title || '';
    box.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    const box = document.getElementById('bdLightbox');
    if (!box) return;
    box.hidden = true;
    document.body.style.overflow = '';
  }

  // ---------- Message seller modal ----------
  function openMessageSeller() {
    const m = document.getElementById('bdMsgModal');
    if (!m) return;
    document.getElementById('bdMsgBookTitle').textContent = book.title;
    document.getElementById('bdMsgBody').value = '';
    m.hidden = false;
    setTimeout(() => document.getElementById('bdMsgBody').focus(), 60);
    document.body.style.overflow = 'hidden';
  }
  function closeMessageSeller() {
    const m = document.getElementById('bdMsgModal');
    if (!m) return;
    m.hidden = true;
    document.body.style.overflow = '';
  }
  async function sendMessage() {
    const body = (document.getElementById('bdMsgBody').value || '').trim();
    if (!body) { toast('Please write a message first.', 'warn'); return; }
    const btn = document.getElementById('bdMsgSendBtn');
    btn.classList.add('btn-loading'); btn.disabled = true;
    try {
      // The seller contact info is exposed via /api/books/:id; the live messaging system
      // is delivered by the seller-side channels (email/phone in book.seller_email/phone).
      // Until the dedicated /api/messages endpoint exists, we fall back to a copy-to-clipboard
      // handoff so the message is never lost.
      const target = book.seller_email || book.seller_phone || '';
      const subject = `About "${book.title}" on BoiGhor`;
      const mailto = `mailto:${encodeURIComponent(target)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
      toast('Opening your mail client…', 'success', 2400);
      closeMessageSeller();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.classList.remove('btn-loading'); btn.disabled = false;
    }
  }

  // ---------- Related ----------
  function renderRelated(list) {
    const host = document.getElementById('bdRelated');
    if (!host) return;
    if (!list.length) {
      host.closest('.bd-related').hidden = true;
      return;
    }
    host.closest('.bd-related').hidden = false;
    host.classList.add('reveal-stagger');
    host.innerHTML = list.map((b, i) => bookCardHtml(b, i)).join('');
    // Re-run setupScrollReveal (added in common.js) so the new cards animate in.
    if (typeof window.setupScrollReveal === 'function') window.setupScrollReveal();
  }

  // ---------- Compose skeleton + render everything ----------
  function renderShell() {
    const root = $content();
    root.innerHTML = `
      <div class="bd-back-row">
        <a class="bd-back-link" href="/" aria-label="Back to browse">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to browse
        </a>
        <nav class="bd-crumbs" id="bdCrumbs" aria-label="Breadcrumb"></nav>
      </div>

      <section class="bd-hero">
        <div class="bd-gallery">
          <div class="bd-main-img" id="bdMainImage"></div>
          <div class="bd-thumbs" id="bdThumbs"></div>
        </div>
        <div class="bd-sticky">
          <div class="bd-buy-card" id="bdBuyCard"></div>
        </div>
      </section>

      <section class="bd-info" style="margin-top:var(--sp-8);">
        <div class="bd-title-block">
          <span class="bd-eyebrow" id="bdEyebrow"></span>
          <h1 class="bd-title" id="bdTitle"></h1>
          <p class="bd-author" id="bdAuthor"></p>
        </div>
        <div class="bd-meta-row" id="bdMeta"></div>

        <div class="bd-section">
          <h2 class="bd-section-title">About this book <small>what the seller wrote</small></h2>
          <div class="bd-desc-card">
            <div class="bd-desc-text" id="bdDesc"></div>
            <div class="bd-tags-row" id="bdTags"></div>
          </div>
        </div>
      </section>

      <section class="bd-section">
        <h2 class="bd-section-title">Meet the seller <small>who you'll be buying from</small></h2>
        <div id="bdSellerProfile"></div>
      </section>

      <section class="bd-section">
        <h2 class="bd-section-title">Reviews <small>${reviews.length} so far</small></h2>
        <div class="bd-reviews-grid">
          <aside class="bd-review-summary" id="bdReviewSummary"></aside>
          <div>
            <div class="bd-review-form-wrap" id="bdReviewFormWrap"></div>
            <div class="bd-review-list" id="bdReviewList"></div>
          </div>
        </div>
      </section>

      <section class="bd-related">
        <div class="bd-related-head">
          <h2 class="bd-section-title">You may also like <small>similar listings</small></h2>
        </div>
        <div class="bd-related-grid" id="bdRelated"></div>
      </section>
    `;
  }

  function showError(title, message) {
    const sk = $skel(); if (sk) sk.hidden = true;
    const c = $content(); if (c) c.hidden = true;
    const e = $error(); if (!e) return;
    document.getElementById('bdErrorTitle').textContent = title;
    document.getElementById('bdErrorMsg').textContent = message;
    e.hidden = false;
  }

  async function boot() {
    currentUser = await initLayout();
    if (currentUser) await loadWishlistCache();

    bookId = new URLSearchParams(window.location.search).get('id');
    if (!bookId) {
      showError('No book selected', 'Open a book from the catalog to see its details.');
      return;
    }

    try {
      await loadBook();
    } catch (err) {
      showError("Couldn't load this book", err.message || 'It may have been removed, or the link is wrong.');
      return;
    }
    const sk = $skel(); if (sk) sk.hidden = true;
    const c = $content(); if (c) c.hidden = false;

    renderShell();
    renderCrumbs();
    renderGallery();
    renderTitleBlock();
    renderMetaRow();
    renderStickyBuy();
    renderDescription();
    renderSeller();
    renderReviews();

    // Related is best-effort, runs in parallel with no UI blocking
    loadRelated().then(renderRelated).catch(() => {});

    // Wire modal / lightbox controls (event delegation)
    const lightbox = document.getElementById('bdLightbox');
    if (lightbox) {
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
      });
      lightbox.querySelector('.lightbox-close')?.addEventListener('click', closeLightbox);
    }
    const msgModal = document.getElementById('bdMsgModal');
    if (msgModal) {
      msgModal.addEventListener('click', (e) => {
        if (e.target === msgModal) closeMessageSeller();
      });
      msgModal.querySelectorAll('[data-act="cancel"]').forEach(el => el.addEventListener('click', closeMessageSeller));
      document.getElementById('bdMsgSendBtn').addEventListener('click', sendMessage);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeLightbox();
        closeMessageSeller();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
