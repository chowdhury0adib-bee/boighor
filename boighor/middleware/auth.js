// middleware/auth.js
// Simple session-based auth guards

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Please login first.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only.' });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
