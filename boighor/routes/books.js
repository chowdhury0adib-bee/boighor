const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db/database');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// ---- Image upload setup ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|webp/.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed.'), ok);
  }
});

// ---- CREATE a book listing ----
router.post('/', requireLogin, upload.single('image'), (req, res) => {
  const { title, author, category, condition_status, price, description } = req.body;

  if (!title || !price) {
    return res.status(400).json({ error: 'Title and price are required.' });
  }

  const image = req.file ? '/uploads/' + req.file.filename : null;

  const info = db.prepare(
    `INSERT INTO books (seller_id, title, author, category, condition_status, price, description, image)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(req.session.user.id, title, author || '', category || '', condition_status || '', price, description || '', image);

  res.json({ message: 'Book listed successfully.', bookId: info.lastInsertRowid });
});

// ---- LIST / SEARCH / FILTER books ----
router.get('/', (req, res) => {
  const { q, category, condition_status, minPrice, maxPrice, status } = req.query;

  let sql = `
    SELECT books.*, users.name AS seller_name, users.university AS seller_university
    FROM books
    JOIN users ON books.seller_id = users.id
    WHERE 1 = 1
  `;
  const params = [];

  // default: only show available books unless a specific status is requested
  sql += ' AND books.status = ?';
  params.push(status || 'available');

  if (q) {
    sql += ' AND (books.title LIKE ? OR books.author LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (category) {
    sql += ' AND books.category = ?';
    params.push(category);
  }
  if (condition_status) {
    sql += ' AND books.condition_status = ?';
    params.push(condition_status);
  }
  if (minPrice) {
    sql += ' AND books.price >= ?';
    params.push(Number(minPrice));
  }
  if (maxPrice) {
    sql += ' AND books.price <= ?';
    params.push(Number(maxPrice));
  }

  sql += ' ORDER BY books.created_at DESC';

  const books = db.prepare(sql).all(...params);
  res.json({ books });
});

// ---- GET single book detail ----
router.get('/:id', (req, res) => {
  const book = db.prepare(`
    SELECT books.*, users.name AS seller_name, users.email AS seller_email,
           users.phone AS seller_phone, users.university AS seller_university
    FROM books JOIN users ON books.seller_id = users.id
    WHERE books.id = ?
  `).get(req.params.id);

  if (!book) return res.status(404).json({ error: 'Book not found.' });

  const reviews = db.prepare(`
    SELECT reviews.*, users.name AS reviewer_name
    FROM reviews JOIN users ON reviews.reviewer_id = users.id
    WHERE seller_id = ?
    ORDER BY reviews.created_at DESC
  `).all(book.seller_id);

  res.json({ book, reviews });
});

// ---- UPDATE a book (only by its seller) ----
router.put('/:id', requireLogin, (req, res) => {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found.' });
  if (book.seller_id !== req.session.user.id) {
    return res.status(403).json({ error: 'You can only edit your own listings.' });
  }

  const { title, author, category, condition_status, price, description, status } = req.body;

  db.prepare(`
    UPDATE books SET title = ?, author = ?, category = ?, condition_status = ?,
      price = ?, description = ?, status = ?
    WHERE id = ?
  `).run(
    title || book.title,
    author || book.author,
    category || book.category,
    condition_status || book.condition_status,
    price || book.price,
    description || book.description,
    status || book.status,
    req.params.id
  );

  res.json({ message: 'Book updated successfully.' });
});

// ---- DELETE a book (only by its seller) ----
router.delete('/:id', requireLogin, (req, res) => {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found.' });
  if (book.seller_id !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only delete your own listings.' });
  }

  db.prepare('DELETE FROM books WHERE id = ?').run(req.params.id);
  res.json({ message: 'Book removed.' });
});

// ---- MY listings ----
router.get('/mine/list', requireLogin, (req, res) => {
  const books = db.prepare('SELECT * FROM books WHERE seller_id = ? ORDER BY created_at DESC')
    .all(req.session.user.id);
  res.json({ books });
});

module.exports = router;
