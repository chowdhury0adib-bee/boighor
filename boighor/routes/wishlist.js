const express = require('express');
const db = require('../db/database');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// ---- Add to wishlist ----
router.post('/', requireLogin, (req, res) => {
  const { book_id } = req.body;
  if (!book_id) return res.status(400).json({ error: 'book_id required.' });

  const book = db.prepare('SELECT id FROM books WHERE id = ?').get(book_id);
  if (!book) return res.status(404).json({ error: 'Book not found.' });

  const existing = db.prepare('SELECT id FROM wishlist WHERE user_id = ? AND book_id = ?')
    .get(req.session.user.id, book_id);
  if (existing) return res.status(400).json({ error: 'Already in wishlist.' });

  db.prepare('INSERT INTO wishlist (user_id, book_id) VALUES (?, ?)')
    .run(req.session.user.id, book_id);

  res.json({ message: 'Added to wishlist.' });
});

// ---- Get my wishlist ----
router.get('/', requireLogin, (req, res) => {
  const items = db.prepare(`
    SELECT wishlist.id AS wishlist_id, books.*
    FROM wishlist JOIN books ON wishlist.book_id = books.id
    WHERE wishlist.user_id = ?
    ORDER BY wishlist.created_at DESC
  `).all(req.session.user.id);
  res.json({ items });
});

// ---- Remove from wishlist ----
router.delete('/:id', requireLogin, (req, res) => {
  db.prepare('DELETE FROM wishlist WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.session.user.id);
  res.json({ message: 'Removed from wishlist.' });
});

module.exports = router;
