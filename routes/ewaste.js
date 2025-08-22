const express = require('express');
const router = express.Router();
const ewasteController = require('../controllers/ewasteController');
const { initializeDatabase, testConnection } = require('../config/database');
const { protect } = require('../middleware/auth'); // Add authentication middleware
// Initialize database on first load
initializeDatabase().catch(console.error);
// Web Routes (EJS/HTML Views)
// Home route - display form
router.get('/', ewasteController.showForm);
// Handle form submission (existing method for web forms)
router.post('/submit', ewasteController.createItem);
// Display all e-waste items
router.get('/items', ewasteController.getAllItems);
// Display single e-waste item by unique_id (for QR code scanning)
router.get('/item/:unique_id', ewasteController.getItemById);
// Download QR codes
router.get('/qr/:unique_id/png', ewasteController.downloadQRPNG);
router.get('/qr/:unique_id/svg', ewasteController.downloadQRSVG);
// API Routes (JSON Responses)
// Get item data as JSON
router.get('/api/item/:unique_id', ewasteController.getItemAPI);
// Get items by department
router.get('/api/department/:dept/items', ewasteController.getItemsByDepartment);
// Get available items for bidding
router.get('/api/items/available', ewasteController.getAvailableItems);
// Update item status
router.patch('/api/item/:unique_id/status', ewasteController.updateItemStatus);
// Bulk QR code generation
router.post('/api/generate-qr-bulk', ewasteController.generateBulkQR);
// NEW PROTECTED API ROUTES FOR COORDINATOR DASHBOARD
// Create new e-waste item via API (protected - requires coordinator login)
router.post('/api/create', protect, ewasteController.createItemAPI);
// Get items for logged-in coordinator
router.get('/api/my-items', protect, ewasteController.getMyItems);
// Get dashboard statistics for logged-in coordinator
router.get('/api/dashboard-stats', protect, ewasteController.getDashboardStats);
// Get all items with JSON response (for dashboard API calls)
router.get('/api/items', ewasteController.getAllItemsAPI);
// ALTERNATIVE ROUTES FOR COMPATIBILITY
// Alternative route for creating items (both should work)
router.post('/api/items', protect, ewasteController.createItemAPI);
// Get item by ID with JSON response
router.get('/api/items/:unique_id', ewasteController.getItemAPI);
// Health check route
router.get('/api/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    res.json({
      success: true,
      status: 'OK',
      database: dbConnected ? 'Connected' : 'Disconnected',
      timestamp: new Date().toISOString(),
      service: 'E-waste Management System'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'Error',
      database: 'Error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
module.exports = router;