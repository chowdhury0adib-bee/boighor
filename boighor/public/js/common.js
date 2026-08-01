// common.js — shared header/footer + small helpers, loaded on every page

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function brandHtml() {
  return `
    <a href="/" class="brand" aria-label="BoiGhor home">
      <span class="brand-mark">B</span>
      <span class="brand-text">BoiGhor<small>student books</small></span>
    </a>
  `;
}

// =============================================================
// THEME (light/dark/auto) — applied ASAP so the first paint is correct
// =============================================================
const THEME_KEY = 'boighor:theme'; // 'light' | 'dark' | 'auto'
const VALID_THEMES = ['light', 'dark', 'auto'];

function getStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return VALID_THEMES.includes(v) ? v : 'auto';
  } catch { return 'auto'; }
}
function setStoredTheme(v) {
  try { localStorage.setItem(THEME_KEY, v); } catch {}
}
function getOSTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light';
}

// Apply theme to <html> / <body> as early as possible to avoid flash.
function applyTheme(theme, { animate = false } = {}) {
  const t = VALID_THEMES.includes(theme) ? theme : 'auto';
  const resolved = t === 'auto' ? getOSTheme() : t;
  if (animate) {
    document.body.classList.add('theme-switching');
    setTimeout(() => document.body.classList.remove('theme-switching'), 320);
  }
  document.documentElement.setAttribute('data-theme', t);
  document.body.setAttribute('data-theme', t);
  document.body.setAttribute('data-os-theme', resolved);
  // Sync the toggle button's aria-label if it exists
  const btn = document.getElementById('themeToggle');
  if (btn) {
    const next = t === 'auto' ? 'auto' : (t === 'dark' ? 'dark' : 'light');
    btn.setAttribute('data-current', next);
    btn.setAttribute('aria-label',
      t === 'auto'  ? 'Theme: auto (follows system). Click to switch to light.'
    : t === 'dark'  ? 'Theme: dark. Click to switch to light.'
                     : 'Theme: light. Click to switch to dark.');
    btn.setAttribute('title', btn.getAttribute('aria-label'));
  }
}

function cycleTheme() {
  const cur = getStoredTheme();
  // light -> dark -> auto -> light
  const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'auto' : 'light';
  setStoredTheme(next);
  applyTheme(next, { animate: true });
  toast(
    next === 'auto'  ? 'Theme: auto (follows your system)' :
    next === 'dark'  ? 'Theme: dark' :
                       'Theme: light',
    'info', 1500
  );
}

function themeToggleHtml() {
  return `
    <button type="button" id="themeToggle" class="theme-toggle"
            aria-label="Toggle theme" title="Toggle theme">
      <svg class="sun" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="4"/>
        <line x1="12" y1="2" x2="12" y2="4"/>
        <line x1="12" y1="20" x2="12" y2="22"/>
        <line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/>
        <line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/>
        <line x1="2" y1="12" x2="4" y2="12"/>
        <line x1="20" y1="12" x2="22" y2="12"/>
        <line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/>
        <line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>
      </svg>
      <svg class="moon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </button>
  `;
}

// Apply earliest theme — runs as a top-level statement when common.js loads.
applyTheme(getStoredTheme());

function renderHeader(activeUser) {
  const headerEl = document.querySelector('header.site');
  const nav = document.getElementById('siteNav');
  if (!nav || !headerEl) return;

  // Make the header host the new classes (sticky + progress bar)
  headerEl.classList.add('nav-shell');
  if (!document.querySelector('.nav-progress')) {
    const bar = document.createElement('div');
    bar.className = 'nav-progress';
    bar.innerHTML = '<div class="nav-progress-bar" id="navProgressBar"></div>';
    headerEl.appendChild(bar);
  }

  const path = (window.location.pathname.replace(/\/$/, '') || '/');
  const isActive = (href) => path === href || (href !== '/' && path.startsWith(href));
  const a = (href, label, cls = '') => {
    const active = isActive(href);
    const classes = [cls.trim(), active ? 'active' : ''].filter(Boolean).join(' ');
    return `<a href="${href}"${classes ? ` class="${classes}"` : ''}>${label}</a>`;
  };

  let rightHTML = '';
  if (activeUser) {
    const initial = escapeHtml((activeUser.name || '?').trim().charAt(0).toUpperCase());
    const role = activeUser.role === 'admin' ? 'Admin' : 'Student';
    const dropdownItems = [
      a('/dashboard.html', 'My Dashboard'),
      a('/dashboard.html#listings', 'My Listings'),
      a('/dashboard.html#purchases', 'My Purchases'),
      a('/dashboard.html#wishlist', 'My Wishlist'),
    ];
    if (activeUser.role === 'admin') dropdownItems.push(a('/admin.html', 'Admin Panel'));

    rightHTML = `
      <a href="/sell.html" class="nav-cta">+ Sell a Book</a>
      ${themeToggleHtml()}
      <div class="nav-dropdown" id="navDropdown">
        <button class="nav-trigger" id="navTrigger" aria-haspopup="menu" aria-expanded="false">
          <span class="nav-avatar">${initial}</span>
          <span class="nav-trigger-meta">
            <span class="nav-trigger-name">${escapeHtml(activeUser.name.split(' ')[0])}</span>
            <span class="nav-trigger-role">${role}</span>
          </span>
          <svg class="nav-trigger-caret" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="nav-menu" role="menu" id="navMenu" aria-hidden="true">
          <div class="nav-menu-head">
            <div class="nav-menu-name">${escapeHtml(activeUser.name)}</div>
            <div class="nav-menu-email">${escapeHtml(activeUser.email)}</div>
          </div>
          <div class="nav-menu-list">
            ${dropdownItems.join('')}
          </div>
          <div class="nav-menu-foot">
            <a href="#" id="logoutBtn" role="menuitem" class="nav-menu-logout">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Log out
            </a>
          </div>
        </div>
      </div>
    `;
  } else {
    rightHTML = `
      <a href="/login.html" class="nav-link">Login</a>
      <a href="/signup.html" class="nav-cta">Sign Up</a>
      ${themeToggleHtml()}
    `;
  }

  nav.innerHTML = `
    ${brandHtml()}
    <nav class="links" id="navLinks" aria-label="Primary">
      <a href="/" class="nav-link ${isActive('/') ? 'active' : ''}">Browse</a>
      <div class="nav-item-dropdown" data-hover>
        <a href="/" class="nav-link">Books
          <svg class="nav-caret" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <div class="nav-mega" role="menu">
          <div class="nav-mega-grid">
            <a href="/?category=Academic" class="nav-mega-card">
              <span class="nav-mega-ico" style="background:linear-gradient(135deg,#23402f,#16281c);">📚</span>
              <div><strong>Academic</strong><small>Textbooks &amp; notes</small></div>
            </a>
            <a href="/?category=Novel" class="nav-mega-card">
              <span class="nav-mega-ico" style="background:linear-gradient(135deg,#d3a12b,#b08622);">📖</span>
              <div><strong>Novels</strong><small>Fiction &amp; classics</small></div>
            </a>
            <a href="/?category=Reference" class="nav-mega-card">
              <span class="nav-mega-ico" style="background:linear-gradient(135deg,#b0432c,#8f3521);">📕</span>
              <div><strong>Reference</strong><small>Dictionaries &amp; guides</small></div>
            </a>
            <a href="/?category=Comics" class="nav-mega-card">
              <span class="nav-mega-ico" style="background:linear-gradient(135deg,#23402f,#d3a12b);">💥</span>
              <div><strong>Comics</strong><small>Manga &amp; graphic novels</small></div>
            </a>
          </div>
          <div class="nav-mega-foot">
            <a href="/">View all categories →</a>
          </div>
        </div>
      </div>
      <a href="/sell.html" class="nav-link ${isActive('/sell.html') ? 'active' : ''}">Sell</a>
      ${activeUser ? `<a href="/dashboard.html" class="nav-link ${isActive('/dashboard.html') ? 'active' : ''}">Dashboard</a>` : ''}
      <span class="nav-divider" aria-hidden="true"></span>
      <span class="nav-right-slot">${rightHTML}</span>
    </nav>
    <button class="menu-toggle" id="menuToggle" aria-label="Open menu" aria-expanded="false" aria-controls="navLinks">
      <span></span>
    </button>
  `;

  // ---- Active-page pill indicator: position a sliding background under the active link ----
  const linksContainer = document.getElementById('navLinks');
  if (linksContainer) {
    requestAnimationFrame(() => moveNavIndicator(linksContainer));
    window.addEventListener('resize', () => moveNavIndicator(linksContainer));
  }

  // ---- Logout ----
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await api('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    });
  }

  // ---- Theme toggle ----
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    applyTheme(getStoredTheme()); // sync aria-label to current state
    themeBtn.addEventListener('click', cycleTheme);
  }

  // ---- Account dropdown (click + hover) ----
  const dropdown = document.getElementById('navDropdown');
  const trigger = document.getElementById('navTrigger');
  const menu = document.getElementById('navMenu');
  if (dropdown && trigger && menu) {
    let openTimer;
    const setOpen = (open) => {
      dropdown.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-hidden', String(!open));
    };
    // Click toggle
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!dropdown.classList.contains('is-open'));
    });
    // Hover open (desktop only)
    dropdown.addEventListener('mouseenter', () => {
      if (window.matchMedia('(hover: hover)').matches) {
        clearTimeout(openTimer);
        setOpen(true);
      }
    });
    dropdown.addEventListener('mouseleave', () => {
      if (window.matchMedia('(hover: hover)').matches) {
        openTimer = setTimeout(() => setOpen(false), 180);
      }
    });
    // Close on outside click / Esc
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  // ---- Mobile menu toggle (drawer) ----
  const menuToggle = document.getElementById('menuToggle');
  if (menuToggle && linksContainer) {
    const setOpen = (open) => {
      linksContainer.classList.toggle('is-open', open);
      menuToggle.classList.toggle('is-open', open);
      headerEl.classList.toggle('menu-open', open);
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) {
        const first = linksContainer.querySelector('a, button');
        if (first) first.focus({ preventScroll: true });
      }
    };
    menuToggle.addEventListener('click', () => setOpen(!linksContainer.classList.contains('is-open')));
    // Close drawer when tapping the backdrop
    headerEl.addEventListener('click', (e) => {
      if (e.target === headerEl && headerEl.classList.contains('menu-open')) setOpen(false);
    });
    linksContainer.querySelectorAll('a').forEach(aEl => aEl.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 760px)').matches) setOpen(false);
    }));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && linksContainer.classList.contains('is-open')) setOpen(false);
    });
  }

  // ---- Scroll-aware shrink + progress bar + shadow ----
  setupNavScroll();
}

// ---- Active-link indicator: smoothly slides under the active nav link ----
function moveNavIndicator(container) {
  if (!container) return;
  const active = container.querySelector('a.nav-link.active');
  if (!active) {
    container.style.removeProperty('--nav-indicator-x');
    container.style.removeProperty('--nav-indicator-w');
    container.style.removeProperty('--nav-indicator-opacity');
    return;
  }
  const cRect = container.getBoundingClientRect();
  const aRect = active.getBoundingClientRect();
  const x = aRect.left - cRect.left + container.scrollLeft;
  const w = aRect.width;
  container.style.setProperty('--nav-indicator-x', `${x}px`);
  container.style.setProperty('--nav-indicator-w', `${w}px`);
  container.style.setProperty('--nav-indicator-opacity', '1');
}

// ---- Scroll effects: shrink header + progress bar + elevated shadow ----
function setupNavScroll() {
  const header = document.querySelector('header.site');
  const bar = document.getElementById('navProgressBar');
  if (!header) return;
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 12);
      header.classList.toggle('is-elevated', y > 80);
      if (bar) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const pct = max > 0 ? Math.min(100, (y / max) * 100) : 0;
        bar.style.width = pct + '%';
      }
      ticking = false;
    });
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
}

function renderFooter() {
  const f = document.getElementById('siteFooter');
  if (!f) return;
  f.innerHTML = `
    <div class="wrap">
      <div class="footer-grid">
        <div class="footer-col footer-brand">
          <div class="brand" style="margin-bottom:8px;">
            <span class="brand-mark">B</span>
            <span class="brand-text" style="color:var(--paper);">BoiGhor<small style="color:var(--mustard);">student books</small></span>
          </div>
          <p>A secondhand marketplace built for students. Buy cheap textbooks, sell what you've finished — keep knowledge circulating.</p>
        </div>
        <div class="footer-col">
          <h4>Marketplace</h4>
          <a href="/">Browse Books</a>
          <a href="/sell.html">Sell a Book</a>
          <a href="/signup.html">Create Account</a>
        </div>
        <div class="footer-col">
          <h4>Account</h4>
          <a href="/login.html">Login</a>
          <a href="/dashboard.html">Dashboard</a>
          <a href="/dashboard.html#wishlist">Wishlist</a>
        </div>
        <div class="footer-col">
          <h4>About</h4>
          <a href="#">How it works</a>
          <a href="#">Trust &amp; safety</a>
          <a href="#">Contact</a>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${new Date().getFullYear()} BoiGhor. Built by students, for students.</span>
        <span>v1.0 · Made with ♥ in Bangladesh</span>
      </div>
    </div>
  `;
}

// Loads current user then calls back with it. Every page calls this on load.
async function initLayout() {
  let user = null;
  try {
    const data = await api('/api/auth/me');
    user = data.user;
  } catch (e) { /* not logged in */ }
  injectAccessibilityShell();
  renderHeader(user);
  renderFooter();
  setupScrollReveal();
  mountBackToTop();
  return user;
}

// IntersectionObserver-based scroll reveal (purely additive — does not break layout)
// Exposed on window so per-page renderers can re-run it after injecting new DOM.
window.setupScrollReveal = function setupScrollReveal() {
  if (!('IntersectionObserver' in window)) return;
  const els = document.querySelectorAll('.reveal-up, .reveal-fade, .reveal');
  if (!els.length) return;
  // Initial state hidden (if reduced motion isn't a concern, CSS handles it)
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        // Auto-stagger direct children that opted in via .reveal-stagger
        if (entry.target.classList.contains('reveal-stagger')) {
          Array.from(entry.target.children).forEach((child, i) => {
            child.style.setProperty('--i', i);
            if (!child.classList.contains('reveal-up') && !child.classList.contains('reveal-fade')) {
              child.classList.add('reveal-up');
            }
          });
        }
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -10% 0px' });
  els.forEach(el => io.observe(el));
}

// Add a skip-link for accessibility (call once per page; safe to re-call).
function injectAccessibilityShell() {
  if (document.querySelector('.skip-link')) return;
  const a = document.createElement('a');
  a.href = '#main';
  a.className = 'skip-link';
  a.textContent = 'Skip to main content';
  document.body.prepend(a);
}

// Mount a floating "back to top" button. Appears after 400px scroll, smooth-scrolls up.
function mountBackToTop() {
  if (document.getElementById('backToTop')) return;
  const btn = document.createElement('button');
  btn.id = 'backToTop';
  btn.className = 'back-to-top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.type = 'button';
  btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4 L4 11 M10 4 L16 11 M10 4 L10 16" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  document.body.appendChild(btn);
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      btn.classList.toggle('is-visible', window.scrollY > 400);
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function money(n) {
  return 'Tk ' + Number(n).toLocaleString('en-BD');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ---------- Toast notifications ----------
// Drop-in replacement for window.alert(). Auto-dismisses, stackable, animated.
function toast(message, type = 'info', duration = 3200) {
  let host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastHost';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <span class="toast-icon">${toastIcon(type)}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
    <button class="toast-x" aria-label="Dismiss">×</button>
  `;
  host.appendChild(el);
  // trigger enter animation
  requestAnimationFrame(() => el.classList.add('toast-in'));

  const close = () => {
    el.classList.remove('toast-in');
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  el.querySelector('.toast-x').addEventListener('click', close);
  if (duration > 0) setTimeout(close, duration);
}

function toastIcon(type) {
  return ({
    success: '✓',
    error: '✕',
    warn: '!',
    info: 'i'
  })[type] || 'i';
}

// ---------- Styled confirm modal ----------
// Promise-based replacement for window.confirm().
function confirmModal({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <h3 id="modalTitle">${escapeHtml(title)}</h3>
        ${message ? `<p class="modal-msg">${escapeHtml(message)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn secondary" data-act="cancel">${escapeHtml(cancelText)}</button>
          <button class="btn ${danger ? 'danger' : ''}" data-act="ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-in'));

    const cleanup = (val) => {
      overlay.classList.remove('modal-in');
      overlay.classList.add('modal-out');
      overlay.addEventListener('animationend', () => {
        overlay.remove();
        resolve(val);
      }, { once: true });
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => cleanup(false));
    overlay.querySelector('[data-act="ok"]').addEventListener('click', () => cleanup(true));
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esc); cleanup(false); }
    });
  });
}

// ---------- Lightweight debounce ----------
function debounce(fn, wait = 250) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// ---------- React to OS theme changes (only if user is on 'auto') ----------
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e) => {
    if (getStoredTheme() === 'auto') {
      document.body.setAttribute('data-os-theme', e.matches ? 'dark' : 'light');
    }
  };
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else if (mq.addListener) mq.addListener(handler); // older Safari
}
