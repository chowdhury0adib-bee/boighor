const express = require('express');
const db = require('../db/database');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// ---- Place an order (buyer requests to buy a book) ----
router.post('/', requireLogin, (req, res) => {
  const { book_id } = req.body;
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(book_id);

  if (!book) return res.status(404).json({ error: 'Book not found.' });
  if (book.status !== 'available') {
    return res.status(400).json({ error: 'This book is no longer available.' });
  }
  if (book.seller_id === req.session.user.id) {
    return res.status(400).json({ error: 'You cannot buy your own book.' });
  }

  const info = db.prepare('INSERT INTO orders (buyer_id, book_id) VALUES (?, ?)')
    .run(req.session.user.id, book_id);

  res.json({ message: 'Order request sent to seller.', orderId: info.lastInsertRowid });
});

// ---- My purchases (as buyer) ----
router.get('/my-purchases', requireLogin, (req, res) => {
  const orders = db.prepare(`
    SELECT orders.*, books.title, books.price, books.image, users.name AS seller_name
    FROM orders
    JOIN books ON orders.book_id = books.id
    JOIN users ON books.seller_id = users.id
    WHERE orders.buyer_id = ?
    ORDER BY orders.created_at DESC
  `).all(req.session.user.id);
  res.json({ orders });
});

// ---- Orders received (as seller) ----
router.get('/received', requireLogin, (req, res) => {
  const orders = db.prepare(`
    SELECT orders.*, books.title, books.price, books.image, users.name AS buyer_name, users.phone AS buyer_phone
    FROM orders
    JOIN books ON orders.book_id = books.id
    JOIN users ON orders.buyer_id = users.id
    WHERE books.seller_id = ?
    ORDER BY orders.created_at DESC
  `).all(req.session.user.id);
  res.json({ orders });
});

// ---- Update order status (seller confirms / completes / cancels) ----
router.put('/:id/status', requireLogin, (req, res) => {
  const { status } = req.body; // 'completed' or 'cancelled'
  const order = db.prepare(`
    SELECT orders.*, books.seller_id FROM orders
    JOIN books ON orders.book_id = books.id
    WHERE orders.id = ?
  `).get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.seller_id !== req.session.user.id) {
    return res.status(403).json({ error: 'Only the seller can update this order.' });
  }

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);

  if (status === 'completed') {
    db.prepare('UPDATE books SET status = ? WHERE id = ?').run('sold', order.book_id);
  }

  res.json({ message: 'Order status updated.' });
});

module.exports = router;
