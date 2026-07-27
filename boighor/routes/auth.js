const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');

const router = express.Router();

// ---- SIGNUP ----
router.post('/signup', (req, res) => {
  const { name, email, password, university, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    `INSERT INTO users (name, email, password, university, phone)
     VALUES (?, ?, ?, ?, ?)`
  ).run(name, email, hashed, university || '', phone || '');

  req.session.user = {
    id: info.lastInsertRowid,
    name,
    email,
    role: 'user'
  };

  res.json({ message: 'Account created successfully.', user: req.session.user });
});

// ---- LOGIN ----
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: 'Invalid email or password.' });
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };

  res.json({ message: 'Logged in successfully.', user: req.session.user });
});

// ---- LOGOUT ----
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out.' });
  });
});

// ---- CURRENT USER ----
router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;
