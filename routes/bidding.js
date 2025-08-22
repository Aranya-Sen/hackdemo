const express = require('express');
const router = express.Router();
const {
  getAvailableItems,
  placeBid,
  getRecyclerBids,
  getAllBids,
  acceptBid,
  rejectBid,
  getRecyclerStats,
  getRecyclerPurchasedItems,
  getCoordinatorStats
} = require('../controllers/biddingController');

const { authenticateRecycler, authenticateCoordinator } = require('../middleware/auth');

// 🔧 RECYCLER ROUTES
router.get('/items/available', authenticateRecycler, getAvailableItems);
router.post('/place', authenticateRecycler, placeBid);
router.get('/recycler/bids', authenticateRecycler, getRecyclerBids);
router.get('/recycler/stats', authenticateRecycler, getRecyclerStats);           // NEW
router.get('/recycler/purchased', authenticateRecycler, getRecyclerPurchasedItems); // NEW

// 🔧 COORDINATOR ROUTES  
router.get('/coordinator/bids', authenticateCoordinator, getAllBids);
router.put('/coordinator/accept/:bidId', authenticateCoordinator, acceptBid);
router.put('/coordinator/reject/:bidId', authenticateCoordinator, rejectBid);
router.get('/coordinator/stats', authenticateCoordinator, getCoordinatorStats);   // NEW

module.exports = router;