const express = require('express');
const router = express.Router();
const {
  getDepartmentLeaderboard,
  getTrendingDepartments,
  getDepartmentDetails
} = require('../controllers/leaderboardController');

// 🔧 PUBLIC ROUTES (for homepage leaderboard)
router.get('/departments', getDepartmentLeaderboard);
router.get('/trending', getTrendingDepartments);
router.get('/department/:department', getDepartmentDetails);

module.exports = router;