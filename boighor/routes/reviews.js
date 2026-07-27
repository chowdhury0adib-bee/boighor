const express = require('express');
const db = require('../db/database');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// ---- Add a review for a seller ----
router.post('/', requireLogin, (req, res) => {
  const { seller_id, rating, comment } = req.body;

  if (!seller_id || !rating) {
    return res.status(400).json({ error: 'Seller and rating are required.' });
  }
  if (Number(seller_id) === req.session.user.id) {
    return res.status(400).json({ error: 'You cannot review yourself.' });
  }

  db.prepare('INSERT INTO reviews (reviewer_id, seller_id, rating, comment) VALUES (?, ?, ?, ?)')
    .run(req.session.user.id, seller_id, rating, comment || '');

  res.json({ message: 'Review submitted.' });
});

// ---- Get reviews for a seller ----
router.get('/seller/:sellerId', (req, res) => {
  const reviews = db.prepare(`
    SELECT reviews.*, users.name AS reviewer_name
    FROM reviews JOIN users ON reviews.reviewer_id = users.id
    WHERE seller_id = ? ORDER BY created_at DESC
  `).all(req.params.sellerId);

  const avg = db.prepare('SELECT AVG(rating) AS avgRating, COUNT(*) AS total FROM reviews WHERE seller_id = ?')
    .get(req.params.sellerId);

  res.json({ reviews, avgRating: avg.avgRating || 0, total: avg.total });
});

module.exports = router;
