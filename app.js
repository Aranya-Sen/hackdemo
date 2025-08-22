const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const coordinatorController = require('./controllers/coordinatorController');
const recyclerController = require('./controllers/recyclerController');

// Import auth middleware
const { authenticateRecycler, authenticateCoordinator } = require('./middleware/auth');
const app = express();

// Import routes
const coordinatorRoutes = require('./routes/coordinator');
const recyclerRoutes = require('./routes/recycler');
const ewasteRoutes = require('./routes/ewaste');
const biddingRoutes = require('./routes/bidding');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');

// Import database connection
const { pool } = require('./config/database');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup for EJS
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// API Routes
app.use('/api/coordinator', coordinatorRoutes);
app.use('/api/recycler', recyclerRoutes);
app.use('/api/ewaste', ewasteRoutes);
app.use('/api/bidding', biddingRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/admin', adminRoutes);

// Direct access routes for EJS views
app.use('/ewaste', ewasteRoutes);
app.use('/recycler', recyclerRoutes);  // ADD THIS LINE

// HOME PAGE ROUTE
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/index.html'));
});

// COORDINATOR ROUTES
app.get('/coordinator/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/coordinator/login.html'));
});

app.get('/coordinator/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/coordinator/signup.html'));
});

// Remove the current dashboard route and replace with:
app.get('/coordinator/dashboard', authenticateCoordinator, coordinatorController.getDashboard);

app.get('/coordinator/bids', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/coordinator/bid-management.html'));
});

// RECYCLER ROUTES
app.get('/recycler/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/recycler/login.html'));
});

app.get('/recycler/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/recycler/signup.html'));
});

app.get('/recycler/dashboard', authenticateRecycler, recyclerController.getDashboard);

// DEBUG ROUTES - PLACE BEFORE 404 HANDLER!
app.get('/debug/recycler-token', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    headers: {
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
      userAgent: req.headers['user-agent'],
      accept: req.headers.accept
    },
    localStorage_instructions: "Check browser console: console.log('Token:', localStorage.getItem('recyclerToken'))",
    query: req.query,
    path: req.path
  });
});

app.get('/debug/test-recycler-auth', authenticateRecycler, (req, res) => {
  res.json({
    success: true,
    message: 'Recycler authentication working!',
    recyclerId: req.recyclerId,
    recycler: req.recycler,
    user: req.user
  });
});

app.get('/debug/coordinator-token', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    headers: {
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
      userAgent: req.headers['user-agent'],
      accept: req.headers.accept
    }
  });
});

app.get('/debug/test-coordinator-auth', authenticateCoordinator, (req, res) => {
  res.json({
    success: true,
    message: 'Coordinator authentication working!',
    coordinatorId: req.coordinatorId,
    coordinator: req.coordinator,
    user: req.user
  });
});

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'Connected'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Handle 404 - THIS MUST BE LAST!
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Database connection and server startup
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection established successfully');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`\n🏠 HOMEPAGE:`);
      console.log(`🌐 Home: http://localhost:${PORT}/`);
      console.log(`\n📊 COORDINATOR PORTAL:`);
      console.log(`🌐 Login: http://localhost:${PORT}/coordinator/login`);
      console.log(`📝 Signup: http://localhost:${PORT}/coordinator/signup`);
      console.log(`📊 Dashboard: http://localhost:${PORT}/coordinator/dashboard`);
      console.log(`\n♻️  RECYCLER PORTAL:`);
      console.log(`🌐 Login: http://localhost:${PORT}/recycler/login`);
      console.log(`📝 Signup: http://localhost:${PORT}/recycler/signup`);
      console.log(`📊 Dashboard: http://localhost:${PORT}/recycler/dashboard`);
      console.log(`\n🔧 DEBUG ROUTES:`);
      console.log(`🐛 Recycler Token: http://localhost:${PORT}/debug/recycler-token`);
      console.log(`🐛 Test Recycler Auth: http://localhost:${PORT}/debug/test-recycler-auth`);
      console.log(`🐛 Coordinator Token: http://localhost:${PORT}/debug/coordinator-token`);
      console.log(`🐛 Test Coordinator Auth: http://localhost:${PORT}/debug/test-coordinator-auth`);
      console.log(`\n📋 E-WASTE MANAGEMENT:`);
      console.log(`📝 Add Item: http://localhost:${PORT}/ewaste/`);
      console.log(`📦 View Items: http://localhost:${PORT}/ewaste/items`);
      console.log(`\n🔧 SYSTEM:`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
    });
    
  } catch (error) {
    console.error('❌ Unable to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;