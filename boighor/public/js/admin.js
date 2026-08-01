async function loadStats() {
  const s = await api('/api/admin/stats');
  document.getElementById('statsRow').innerHTML = `
    <div class="stat"><div class="num">${s.users}</div><div class="label">Students</div></div>
    <div class="stat"><div class="num">${s.books}</div><div class="label">Total Listings</div></div>
    <div class="stat"><div class="num">${s.available}</div><div class="label">Available</div></div>
    <div class="stat"><div class="num">${s.sold}</div><div class="label">Sold</div></div>
    <div class="stat"><div class="num">${s.orders}</div><div class="label">Orders</div></div>
  `;
}

async function loadUsers() {
  const { users } = await api('/api/admin/users');
  const el = document.getElementById('tab-users');
  if (!users.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-illus">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        </div>
        <h3>No students yet</h3>
        <p>Once students sign up, they'll show up here.</p>
      </div>
    `;
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>University</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td>${escapeHtml(u.name)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td>${escapeHtml(u.university || '—')}</td>
            <td>${escapeHtml(u.role)}</td>
            <td>${new Date(u.created_at).toLocaleDateString()}</td>
            <td>${u.role !== 'admin' ? `<button class="btn small danger" data-del-user="${u.id}">Remove</button>` : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  el.querySelectorAll('[data-del-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Remove this user?',
        message: 'All their listings and reviews will also be removed.',
        confirmText: 'Remove user',
        danger: true
      });
      if (!ok) return;
      btn.classList.add('btn-loading');
      try {
        await api('/api/admin/users/' + btn.dataset.delUser, { method: 'DELETE' });
        toast('User removed', 'success', 1500);
        loadUsers();
        loadStats();
      } catch (err) {
        toast(err.message, 'error');
        btn.classList.remove('btn-loading');
      }
    });
  });
}

async function loadListings() {
  const { books } = await api('/api/admin/books');
  const el = document.getElementById('tab-listings');
  if (!books.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-illus">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
        </div>
        <h3>No listings yet</h3>
        <p>Students haven't listed any books yet.</p>
      </div>
    `;
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Title</th><th>Seller</th><th>Price</th><th>Status</th><th>Listed</th><th>Actions</th></tr></thead>
      <tbody>
        ${books.map(b => `
          <tr>
            <td><a href="/book-detail.html?id=${b.id}">${escapeHtml(b.title)}</a></td>
            <td>${escapeHtml(b.seller_name)}</td>
            <td class="price">${money(b.price)}</td>
            <td>${escapeHtml(b.status)}</td>
            <td>${new Date(b.created_at).toLocaleDateString()}</td>
            <td><button class="btn small danger" data-del-book="${b.id}">Remove</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  el.querySelectorAll('[data-del-book]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Remove this listing?',
        message: 'This will permanently delete the book listing.',
        confirmText: 'Remove',
        danger: true
      });
      if (!ok) return;
      btn.classList.add('btn-loading');
      try {
        await api('/api/admin/books/' + btn.dataset.delBook, { method: 'DELETE' });
        toast('Listing removed', 'success', 1500);
        loadListings();
        loadStats();
      } catch (err) {
        toast(err.message, 'error');
        btn.classList.remove('btn-loading');
      }
    });
  });
}

function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await initLayout();
  if (!user || user.role !== 'admin') { window.location.href = '/'; return; }
  setupTabs();
  loadStats();
  loadUsers();
  loadListings();
});
