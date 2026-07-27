# BoiGhor — Secondhand Book Marketplace for Students

A full-stack web app where students can buy and sell used books
(textbooks, novels, references) with each other.

## Tech Stack
- **Backend:** Node.js + Express
- **Frontend:** Plain HTML, CSS, JavaScript (no framework)
- **Database:** SQLite, via Node's built-in `node:sqlite` module
  (no separate database server or native compiler needed — it just
  creates a single `db/boighor.db` file the first time you run it)

## Features
- User signup / login (passwords hashed with bcrypt)
- List a book for sale, with cover photo upload
- Browse / search / filter books (by title, category, condition, price)
- Book detail page with seller info and star ratings
- "Request to Buy" order flow + seller order management
- Wishlist
- Seller reviews & ratings
- Student dashboard (My Listings / Orders Received / My Purchases / Wishlist)
- Admin panel (stats, manage users, manage listings)

## Requirements
- [Node.js](https://nodejs.org) version **22.5 or newer** (this project
  uses Node's built-in experimental SQLite module, which needs Node 22.5+).
  Check your version with:
  ```
  node -v
  ```

## How to Run

1. Open a terminal in this folder.
2. Install dependencies:
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open your browser at:
   ```
   http://localhost:3000
   ```

The first time you run it, a `db/boighor.db` SQLite file is created
automatically and a default admin account is seeded:

```
Admin email:    admin@boighor.com
Admin password: admin123
```

## Project Structure
```
boighor/
├── server.js              # Express app entry point
├── db/
│   ├── database.js        # SQLite connection + table creation
│   └── boighor.db         # created automatically on first run
├── middleware/
│   └── auth.js             # login / admin route guards
├── routes/
│   ├── auth.js             # signup, login, logout
│   ├── books.js             # book listings (CRUD, search, filter)
│   ├── orders.js            # buy requests, order status
│   ├── reviews.js           # seller reviews
│   ├── wishlist.js          # wishlist
│   └── admin.js             # admin stats / user & listing management
├── public/                  # frontend (plain HTML/CSS/JS)
│   ├── index.html            # browse / search books
│   ├── login.html
│   ├── signup.html
│   ├── sell.html              # list a new book
│   ├── book-detail.html
│   ├── dashboard.html         # student dashboard
│   ├── admin.html              # admin panel
│   ├── css/style.css
│   └── js/                     # one script per page + common.js
└── uploads/                  # uploaded book cover images
```

## Notes for viva / presentation
- Passwords are never stored in plain text — they're hashed with `bcryptjs`.
- Login state is kept using `express-session` (a cookie holds a session ID;
  the actual user data stays server-side).
- Each book listing is tied to a `seller_id`; only that seller (or an admin)
  can edit/delete it — enforced in `routes/books.js`.
- The "Request to Buy" flow doesn't process real payments — it creates an
  `order` record so the buyer and seller can arrange the handover themselves,
  which matches how secondhand marketplaces like this realistically work.
