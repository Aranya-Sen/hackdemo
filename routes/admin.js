const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const path = require('path');

// Admin dashboard route (direct access, no authentication)
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/admin/dashboard.html'));
});

// API Routes for admin operations

// Get items currently in bidding status
router.get('/api/items/bidding', adminController.getItemsInBidding);

// Close bidding for a specific item
router.post('/api/close-bid/:item_id', adminController.closeBidding);

// Get items count by type for pie chart
router.get('/api/stats/items-by-type', adminController.getItemsByType);

// Get comprehensive dashboard statistics
router.get('/api/stats/dashboard', adminController.getDashboardStats);

// Health check for admin API
router.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Admin API is running',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /admin - Admin dashboard',
      'GET /admin/api/items/bidding - Get items in bidding',
      'POST /admin/api/close-bid/:item_id - Close bidding for item',
      'GET /admin/api/stats/items-by-type - Get items by type stats',
      'GET /admin/api/stats/dashboard - Get dashboard stats'
    ]
  });
});

module.exports = router;