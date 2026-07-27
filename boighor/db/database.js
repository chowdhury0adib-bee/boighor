// database.js
// Sets up the SQLite database (using Node's built-in node:sqlite module)
// and creates all the tables BoiGhor needs.

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'boighor.db');
const db = new DatabaseSync(dbPath);

// ---- Create tables (only if they don't already exist) ----
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    university TEXT,
    phone TEXT,
    role TEXT DEFAULT 'user',            -- 'user' or 'admin'
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    category TEXT,
    condition_status TEXT,               -- New / Good / Fair
    price REAL NOT NULL,
    description TEXT,
    image TEXT,
    status TEXT DEFAULT 'available',      -- available / sold / removed
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (seller_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',        -- pending / completed / cancelled
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (book_id) REFERENCES books(id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reviewer_id INTEGER NOT NULL,
    seller_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,              -- 1 to 5
    comment TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (reviewer_id) REFERENCES users(id),
    FOREIGN KEY (seller_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS wishlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (book_id) REFERENCES books(id)
  );
`);

// ---- Seed one admin account if none exists ----
const adminCheck = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
if (!adminCheck) {
  const hashed = bcrypt.hashSync('admin123', 10);
  db.prepare(
    `INSERT INTO users (name, email, password, university, phone, role)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('Admin', 'admin@boighor.com', hashed, 'BoiGhor HQ', '01700000000', 'admin');
  console.log('Seeded default admin -> email: admin@boighor.com | password: admin123');
}

module.exports = db;
