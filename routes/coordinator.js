// routes/coordinator.js
const express = require('express');
const router = express.Router();
const coordinatorController = require('../controllers/coordinatorController');
const { authenticateCoordinator } = require('../middleware/auth'); // Use unified auth

// Public routes
router.post('/signup', coordinatorController.signup);
router.post('/login', coordinatorController.login);

// Protected routes
router.get('/profile', authenticateCoordinator, coordinatorController.getProfile);
router.put('/profile', authenticateCoordinator, coordinatorController.updateProfile);
router.put('/change-password', authenticateCoordinator, coordinatorController.changePassword);
router.get('/dashboard', authenticateCoordinator, coordinatorController.getDashboard);

module.exports = router;