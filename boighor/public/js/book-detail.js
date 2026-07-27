let currentUser = null;
let currentBook = null;

function starString(avg) {
  const rounded = Math.round(avg);
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

async function render() {
  const id = new URLSearchParams(window.location.search).get('id');
  const content = document.getElementById('content');

  if (!id) { content.innerHTML = '<div class="empty"><h3>No book selected.</h3></div>'; return; }

  let data;
  try {
    data = await api('/api/books/' + id);
  } catch (err) {
    content.innerHTML = `<div class="empty"><h3>${escapeHtml(err.message)}</h3></div>`;
    return;
  }

  currentBook = data.book;
  const b = data.book;
  const isOwner = currentUser && currentUser.id === b.seller_id;
  const avg = data.reviews.length
    ? data.reviews.reduce((s, r) => s + r.rating, 0) / data.reviews.length
    : 0;

  content.innerHTML = `
    <div class="detail-grid">
      <div>
        ${b.image ? `<img src="${b.image}" alt="${escapeHtml(b.title)}">` : `<div class="thumb-lg" style="display:flex;align-items:center;justify-content:center;color:#9c9375;font-family:'Lora',serif;font-style:italic;">no cover uploaded</div>`}
      </div>
      <div>
        <span class="eyebrow">${escapeHtml(b.category || 'Book')} · ${escapeHtml(b.condition_status || '—')}</span>
        <h1>${escapeHtml(b.title)}</h1>
        ${b.author ? `<p class="author" style="font-style:italic;color:#675f49;">by ${escapeHtml(b.author)}</p>` : ''}
        <p class="price" style="font-size:1.6rem;">${money(b.price)}</p>
        ${b.status !== 'available' ? `<span class="tag" style="background:var(--rust);color:#fff;">${b.status.toUpperCase()}</span>` : ''}
        <p style="margin-top:14px; line-height:1.6;">${escapeHtml(b.description) || 'No description provided.'}</p>

        <div id="actionArea" style="margin-top:20px; display:flex; gap:10px; flex-wrap:wrap;"></div>

        <div class="seller-box">
          <strong>${escapeHtml(b.seller_name)}</strong><br>
          <span style="font-size:.85rem; color:#675f49;">${escapeHtml(b.seller_university || '')}</span><br>
          <span class="stars">${starString(avg)}</span>
          <span style="font-size:.82rem; color:#675f49;"> (${data.reviews.length} review${data.reviews.length === 1 ? '' : 's'})</span>
        </div>
      </div>
    </div>

    <div style="margin-top:40px; max-width:720px;">
      <h2>Reviews for this seller</h2>
      <div id="reviewList" style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;"></div>
      <div id="reviewFormArea"></div>
    </div>
  `;

  document.getElementById('reviewList').innerHTML = data.reviews.length
    ? data.reviews.map(r => `
        <div style="border:1px solid var(--line); border-radius:3px; padding:12px; background:var(--card);">
          <strong>${escapeHtml(r.reviewer_name)}</strong>
          <span class="stars">${starString(r.rating)}</span>
          <p style="margin:6px 0 0; font-size:.9rem;">${escapeHtml(r.comment)}</p>
        </div>
      `).join('')
    : '<p style="color:#7a715a;">No reviews yet for this seller.</p>';

  // ---- Action buttons ----
  const actionArea = document.getElementById('actionArea');
  if (!currentUser) {
    actionArea.innerHTML = `<a href="/login.html" class="btn">Login to Buy or Save</a>`;
  } else if (isOwner) {
    actionArea.innerHTML = `<a href="/dashboard.html" class="btn secondary">Manage in Dashboard</a>`;
  } else if (b.status !== 'available') {
    actionArea.innerHTML = `<button class="btn" disabled>Already ${b.status}</button>`;
  } else {
    actionArea.innerHTML = `
      <button class="btn" id="buyBtn">Request to Buy</button>
      <button class="btn secondary" id="wishBtn">♡ Save to Wishlist</button>
    `;
    document.getElementById('buyBtn').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      btn.classList.add('btn-loading');
      btn.disabled = true;
      try {
        await api('/api/orders', { method: 'POST', body: JSON.stringify({ book_id: b.id }) });
        toast('Request sent! The seller will contact you to arrange the exchange.', 'success', 4500);
        btn.textContent = '✓ Request sent';
      } catch (err) {
        toast(err.message, 'error');
        btn.classList.remove('btn-loading');
        btn.disabled = false;
      }
    });
    document.getElementById('wishBtn').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      try {
        await api('/api/wishlist', { method: 'POST', body: JSON.stringify({ book_id: b.id }) });
        btn.classList.add('heart-pop');
        btn.textContent = '♥ Saved';
        toast('Added to wishlist!', 'success', 1800);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // ---- Review form (only for logged-in non-owners) ----
  const reviewFormArea = document.getElementById('reviewFormArea');
  if (currentUser && !isOwner) {
    reviewFormArea.innerHTML = `
      <form class="card-form" id="reviewForm" style="max-width:100%; padding:20px;">
        <div class="field">
          <label for="rating">Rate this seller</label>
          <select id="rating">
            <option value="5">★★★★★ Excellent</option>
            <option value="4">★★★★☆ Good</option>
            <option value="3">★★★☆☆ Okay</option>
            <option value="2">★★☆☆☆ Poor</option>
            <option value="1">★☆☆☆☆ Bad</option>
          </select>
        </div>
        <div class="field">
          <label for="comment">Comment</label>
          <textarea id="comment" placeholder="How was your experience with this seller?"></textarea>
        </div>
        <button class="btn small" type="submit">Submit Review</button>
        <div class="form-msg" id="reviewMsg"></div>
      </form>
    `;
    document.getElementById('reviewForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('reviewMsg');
      msg.className = 'form-msg';
      const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
      submitBtn.classList.add('btn-loading');
      submitBtn.disabled = true;
      try {
        await api('/api/reviews', {
          method: 'POST',
          body: JSON.stringify({
            seller_id: b.seller_id,
            rating: document.getElementById('rating').value,
            comment: document.getElementById('comment').value
          })
        });
        msg.textContent = 'Review submitted!';
        msg.classList.add('success');
        toast('Review submitted!', 'success');
        render();
      } catch (err) {
        msg.textContent = err.message;
        msg.classList.add('error');
        toast(err.message, 'error');
        submitBtn.classList.remove('btn-loading');
        submitBtn.disabled = false;
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await initLayout();
  render();
});
