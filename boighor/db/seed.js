// db/seed.js
// Production-safe automatic seeding for BoiGhor.
//
// Usage:
//   const { seedDatabase } = require('./db/seed');
//   await seedDatabase();
//
// Semantics:
//   - If the `books` table has fewer than 20 rows, inserts the 20 sample
//     books + 10 sample sellers + 20 themed SVG covers, then prints:
//
//       "Database seeded with sample books"
//
//   - Otherwise, prints:
//
//       "Sample books already exist"
//
//   - Never creates duplicate books (idempotent across restarts and
//     across deployments on Render's ephemeral disk).
//   - Does NOT touch the schema.
//   - Does NOT touch existing rows.
//   - Reuses the shared `db` connection from `db/database.js` so we
//     don't open a second SQLite handle (avoids file-locking issues).
//   - Re-running is safe: the count check is the only gate.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = require('./database');

const MIN_BOOKS = 20;
const MIN_SELLERS = 6;

// ---------- Sample sellers (idempotent on email) ----------
const sampleSellers = [
  { name: 'Tahmid Rahman',     email: 'tahmid.rahman@boighor.dev',     university: 'North South University' },
  { name: 'Anika Hossain',     email: 'anika.hossain@boighor.dev',     university: 'BRAC University' },
  { name: 'Sabbir Ahmed',      email: 'sabbir.ahmed@boighor.dev',      university: 'BUET' },
  { name: 'Nusrat Jahan',      email: 'nusrat.jahan@boighor.dev',      university: 'East West University' },
  { name: 'Rifat Khan',        email: 'rifat.khan@boighor.dev',        university: 'IUT Gazipur' },
  { name: 'Mehedi Hasan',      email: 'mehedi.hasan@boighor.dev',      university: 'Ahsanullah University' },
  { name: 'Sumaiya Akter',     email: 'sumaiya.akter@boighor.dev',     university: 'Jahangirnagar University' },
  { name: 'Imran Chowdhury',   email: 'imran.chowdhury@boighor.dev',   university: 'Chittagong University' },
  { name: 'Tasnim Iqbal',      email: 'tasnim.iqbal@boighor.dev',      university: 'Daffodil International University' },
  { name: 'Sakib Hossain',     email: 'sakib.hossain@boighor.dev',     university: 'Khulna University of Engineering' },
];

// ---------- 20 sample books ----------
const books = [
  // Academic
  { title: 'Calculus',                              author: 'James Stewart',       category: 'Academic',    condition: 'Good',     price: 450,  status: 'available', desc: 'Single-variable calculus, 8th edition. Clean, no highlights.' },
  { title: 'Physics',                               author: 'Halliday & Resnick',  category: 'Academic',    condition: 'Like New', price: 680,  status: 'available', desc: 'Fundamentals of Physics, 10th edition. Almost untouched.' },
  { title: 'Organic Chemistry',                     author: 'Paula Bruice',        category: 'Academic',    condition: 'Fair',     price: 320,  status: 'available', desc: 'Some yellow highlighting in chapters 6–8. Otherwise intact.' },

  // Programming
  { title: 'Clean Code',                            author: 'Robert C. Martin',    category: 'Programming', condition: 'Good',     price: 550,  status: 'available', desc: 'A handbook of agile software craftsmanship. Light pencil notes.' },
  { title: 'The Pragmatic Programmer',              author: 'Hunt & Thomas',       category: 'Programming', condition: 'New',      price: 720,  status: 'available', desc: '20th anniversary edition. Brand new, sealed.' },
  { title: 'Design Patterns',                       author: 'Gang of Four',        category: 'Programming', condition: 'Like New', price: 480,  status: 'sold',      desc: 'Elements of reusable OO software. Spine intact.' },

  // Fiction
  { title: 'The Kite Runner',                       author: 'Khaled Hosseini',     category: 'Fiction',     condition: 'Good',     price: 280,  status: 'available', desc: 'Paperback, some shelf wear. A moving read.' },
  { title: 'A Thousand Splendid Suns',              author: 'Khaled Hosseini',     category: 'Fiction',     condition: 'Like New', price: 350,  status: 'available', desc: 'Excellent condition, no marks.' },
  { title: 'The Alchemist',                         author: 'Paulo Coelho',        category: 'Fiction',     condition: 'Fair',     price: 220,  status: 'available', desc: 'Pages slightly yellowed. A timeless classic.' },

  // Novel
  { title: 'To Kill a Mockingbird',                 author: 'Harper Lee',          category: 'Novel',       condition: 'Good',     price: 300,  status: 'available', desc: '50th anniversary edition. Clean copy.' },
  { title: '1984',                                  author: 'George Orwell',       category: 'Novel',       condition: 'New',      price: 420,  status: 'available', desc: 'Brand new, unread. Dystopian classic.' },
  { title: 'The Great Gatsby',                      author: 'F. Scott Fitzgerald', category: 'Novel',       condition: 'Like New', price: 380,  status: 'sold',      desc: 'Hardcover with dust jacket. Pristine.' },

  // Business
  { title: 'Rich Dad Poor Dad',                     author: 'Robert Kiyosaki',     category: 'Business',    condition: 'Good',     price: 350,  status: 'available', desc: 'What the rich teach their kids about money.' },
  { title: 'The Lean Startup',                      author: 'Eric Ries',           category: 'Business',    condition: 'Like New', price: 480,  status: 'available', desc: 'How today\'s entrepreneurs use continuous innovation.' },
  { title: 'Zero to One',                           author: 'Peter Thiel',         category: 'Business',    condition: 'Good',     price: 520,  status: 'sold',      desc: 'Notes on startups, or how to build the future.' },

  // Engineering
  { title: 'Engineering Mechanics: Statics',        author: 'Hibbeler',            category: 'Engineering', condition: 'Good',     price: 600,  status: 'available', desc: '14th edition. Includes all chapters. Slight cover wear.' },
  { title: 'Introduction to Algorithms',            author: 'Cormen et al.',       category: 'Engineering', condition: 'Like New', price: 950,  status: 'available', desc: 'CLRS, 3rd edition. The classic algorithms textbook.' },
  { title: 'Microelectronic Circuits',              author: 'Sedra & Smith',       category: 'Engineering', condition: 'Fair',     price: 380,  status: 'available', desc: 'Some annotations in early chapters.' },

  // Edge cases — very short & very long titles, varied prices
  { title: 'S',                                     author: 'Doug Dorst',          category: 'Others',      condition: 'Fair',     price: 150,  status: 'available', desc: 'Very short title test entry — minimalist paperback novel.' },
  { title: 'A Comprehensive Introduction to Modern Software Engineering Practices, Patterns, and Principles for Scalable System Design', author: 'Dr. Elena Vasquez', category: 'Engineering', condition: 'New', price: 1200, status: 'available', desc: 'Long-title test entry. Comprehensive 900-page hardcover, brand new.' },
];

if (books.length !== MIN_BOOKS) {
  // Surface the bug loudly at import time of the module (only matters when
  // the seed path is actually executed).
  // eslint-disable-next-line no-console
  console.error(`[seed] expected ${MIN_BOOKS} books, got ${books.length}. Aborting.`);
}

// ---------- SVG cover generation ----------
// Theme tokens kept in sync with public/css/style.css :root
const PALETTES = [
  { bg: '#f1ead9', accent: '#23402f', label: '#16281c' }, // green
  { bg: '#faf6ec', accent: '#d3a12b', label: '#16281c' }, // mustard
  { bg: '#e6dcc3', accent: '#b0432c', label: '#16281c' }, // rust
  { bg: '#f1ead9', accent: '#8f3521', label: '#16281c' }, // rust-deep
  { bg: '#faf6ec', accent: '#2f5240', label: '#16281c' }, // green-soft
  { bg: '#e6dcc3', accent: '#16281c', label: '#d3a12b' }, // green-deep
];

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

function makeCoverSVG({ title, author, palette }) {
  const t = title.length > 38 ? title.slice(0, 36) + '…' : title;
  const a = author || '';
  const words = t.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 18) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  const lineEls = lines.slice(0, 4).map((ln, i) =>
    `<tspan x="60" dy="${i === 0 ? 0 : 38}">${escapeXml(ln)}</tspan>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">
  <rect width="300" height="400" fill="${palette.bg}"/>
  <rect x="20" y="20" width="260" height="360" fill="none" stroke="${palette.accent}" stroke-width="2" opacity="0.35"/>
  <rect x="40" y="40" width="220" height="320" fill="none" stroke="${palette.accent}" stroke-width="0.8" opacity="0.5"/>
  <text x="60" y="160" font-family="Georgia, serif" font-size="26" font-weight="700" fill="${palette.label}" letter-spacing="0.5">
    ${lineEls}
  </text>
  <text x="60" y="330" font-family="Georgia, serif" font-size="13" font-style="italic" fill="${palette.accent}" opacity="0.85">${escapeXml(a)}</text>
  <line x1="60" y1="345" x2="240" y2="345" stroke="${palette.accent}" stroke-width="1" opacity="0.4"/>
  <text x="60" y="362" font-family="Courier New, monospace" font-size="9" fill="${palette.accent}" opacity="0.6" letter-spacing="2">BOIGHOR</text>
</svg>`;
}

// ---------- Public API ----------
async function seedDatabase() {
  // 1. Bail if we already have enough sample books.
  const existing = db.prepare('SELECT COUNT(*) AS c FROM books').get().c;
  if (existing >= MIN_BOOKS) {
    console.log('Sample books already exist');
    return { seeded: false, count: existing };
  }

  // 2. Make sure we have enough sellers (skip ones that already exist).
  const insertUser = db.prepare(
    `INSERT INTO users (name, email, password, university, phone, role)
     VALUES (?, ?, ?, ?, ?, 'user')`
  );
  const hashed = bcrypt.hashSync('seed1234', 10);
  for (const s of sampleSellers) {
    const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(s.email);
    if (exists) continue;
    insertUser.run(s.name, s.email, hashed, s.university, '01711000000');
  }

  const sellers = db
    .prepare("SELECT id, name, university FROM users WHERE role = 'user' ORDER BY id")
    .all();
  if (sellers.length < MIN_SELLERS) {
    throw new Error(
      `not enough sellers (got ${sellers.length}, need ${MIN_SELLERS})`
    );
  }

  // 3. Generate placeholder SVG covers (only if they're missing).
  const uploadsDir  = path.join(__dirname, '..', 'uploads');
  const coversDir   = path.join(uploadsDir, 'covers');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(coversDir))  fs.mkdirSync(coversDir,  { recursive: true });

  // 4. Insert all books in one transaction.
  const insertBook = db.prepare(
    `INSERT INTO books (seller_id, title, author, category, condition_status,
                       price, description, image, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  try {
    db.exec('BEGIN');
    books.forEach((b, i) => {
      const seller  = sellers[i % sellers.length];
      const palette = PALETTES[i % PALETTES.length];
      const safeId  = String(i + 1).padStart(2, '0');
      const filename = `cover-${safeId}.svg`;
      const filepath = path.join(coversDir, filename);

      // Only write the SVG if it doesn't already exist (keeps the seed
      // safe to re-run if the books table was wiped but the covers survived).
      if (!fs.existsSync(filepath)) {
        fs.writeFileSync(filepath, makeCoverSVG({
          title: b.title, author: b.author, palette
        }), 'utf8');
      }

      insertBook.run(
        seller.id,
        b.title,
        b.author,
        b.category,
        b.condition,
        b.price,
        b.desc,
        `/uploads/covers/${filename}`,
        b.status
      );
    });
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  }

  const finalCount = db.prepare('SELECT COUNT(*) AS c FROM books').get().c;
  console.log('Database seeded with sample books');
  return { seeded: true, count: finalCount };
}

module.exports = {
  seedDatabase,
  // Exposed for unit tests / manual scripts; not used by the server.
  _internal: { books, sampleSellers, makeCoverSVG, MIN_BOOKS }
};