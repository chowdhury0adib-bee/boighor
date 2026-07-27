const express = require('express');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ---- Dashboard stats ----
router.get('/stats', requireAdmin, (req, res) => {
  const users = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'user'").get().c;
  const books = db.prepare('SELECT COUNT(*) AS c FROM books').get().c;
  const available = db.prepare("SELECT COUNT(*) AS c FROM books WHERE status = 'available'").get().c;
  const sold = db.prepare("SELECT COUNT(*) AS c FROM books WHERE status = 'sold'").get().c;
  const orders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;

  res.json({ users, books, available, sold, orders });
});

// ---- All users ----
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare("SELECT id, name, email, university, phone, role, created_at FROM users ORDER BY created_at DESC").all();
  res.json({ users });
});

// ---- Delete a user ----
router.delete('/users/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ? AND role != "admin"').run(req.params.id);
  res.json({ message: 'User removed.' });
});

// ---- All listings (including sold/removed) ----
router.get('/books', requireAdmin, (req, res) => {
  const books = db.prepare(`
    SELECT books.*, users.name AS seller_name FROM books
    JOIN users ON books.seller_id = users.id
    ORDER BY books.created_at DESC
  `).all();
  res.json({ books });
});

// ---- Remove any listing ----
router.delete('/books/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM books WHERE id = ?').run(req.params.id);
  res.json({ message: 'Listing removed by admin.' });
});

module.exports = router;
