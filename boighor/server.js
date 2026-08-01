const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books');
const orderRoutes = require('./routes/orders');
const reviewRoutes = require('./routes/reviews');
const wishlistRoutes = require('./routes/wishlist');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

// Trust the first proxy when behind one (Render, Railway, Heroku, etc.)
app.set('trust proxy', 1);

// ---- Body size limits (mitigates accidental DoS via huge payloads) ----
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---- Session (cookies hardened) ----
app.use(session({
  secret: process.env.SESSION_SECRET || 'boighor-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'boighor.sid',
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 day
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,                    // require HTTPS in prod
    path: '/'
  }
}));

// ---- Security headers (lightweight, zero-dependency) ----
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Referrer leak protection
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Strip identifying headers
  res.removeHeader('X-Powered-By');
  // Disable powerful browser APIs we don't use
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  // Basic CSP — allow images (incl. uploaded covers), inline styles (used by hero SVGs), inline scripts (DOMContentLoaded handlers)
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      // scripts: self + inline + cdn.jsdelivr (GSAP) + unsafe-eval (no — we don't use it)
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );
  next();
});

// ---- Static files (cache + correct MIME) ----
const staticOpts = {
  // Cache "forever" for files with a hash in the URL; 1 hour for the rest.
  // Since we don't hash filenames, use 1h + ETag (express handles ETag).
  maxAge: IS_PROD ? '1h' : 0,
  etag: true,
  // Don't let browsers interpret text/plain as HTML
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
};
app.use(express.static(path.join(__dirname, 'public'), staticOpts));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: IS_PROD ? '7d' : 0,
  etag: true
}));

// ---- Friendly routes for /favicon.ico, /robots.txt, /sitemap.xml ----
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'img', 'favicon.svg'));
});
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    'User-agent: *\n' +
    'Allow: /\n' +
    'Disallow: /api/\n' +
    'Disallow: /dashboard.html\n' +
    'Disallow: /admin.html\n' +
    'Sitemap: /sitemap.xml\n'
  );
});
app.get('/sitemap.xml', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const urls = [
    '', '/index.html', '/login.html', '/signup.html', '/sell.html'
  ].map(u => `${base}${u}`);
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${escapeXml(u)}</loc><changefreq>weekly</changefreq></url>`).join('\n') +
    `\n</urlset>\n`
  );
});

// ---- API routes ----
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/admin', adminRoutes);

// ---- 404 fallback ----
// HTML requests for unknown pages → branded 404 page; everything else → JSON
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  const four = path.join(__dirname, 'public', '404.html');
  if (fs.existsSync(four)) {
    return res.status(404).sendFile(four);
  }
  res.status(404).type('text/plain').send('Not found.');
});

// ---- Global error handler (always last) ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server error]', err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Something went wrong on our end.' });
  }
  res.status(500).type('text/plain').send('Internal server error.');
});

// ---- Helpers ----
function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

app.listen(PORT, () => {
  console.log(`BoiGhor server running -> http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});
