const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books');
const orderRoutes = require('./routes/orders');
const reviewRoutes = require('./routes/reviews');
const wishlistRoutes = require('./routes/wishlist');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'boighor-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// static files (HTML/CSS/JS frontend + uploaded book images)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/admin', adminRoutes);

app.listen(PORT, () => {
  console.log(`BoiGhor server running -> http://localhost:${PORT}`);
});
