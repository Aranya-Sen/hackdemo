const { pool } = require('../config/database');
const jwt = require('jsonwebtoken');

// 🔧 NEW: Get recycler statistics
const getRecyclerStats = async (req, res) => {
  try {
    const recyclerId = req.user.id;
    
    const statsQuery = `
      SELECT 
        COUNT(*) as total_bids,
        COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_bids,
        COUNT(CASE WHEN status = 'accepted' THEN 1 END) as purchased_items,
        COALESCE(SUM(CASE WHEN status = 'accepted' THEN bid_amount ELSE 0 END), 0) as total_spent
      FROM bids 
      WHERE recycler_id = $1
    `;
    
    const statsResult = await pool.query(statsQuery, [recyclerId]);
    const stats = statsResult.rows[0];
    
    res.json({
      success: true,
      totalBids: parseInt(stats.total_bids),
      acceptedBids: parseInt(stats.accepted_bids),
      purchasedItems: parseInt(stats.purchased_items),
      totalSpent: parseFloat(stats.total_spent).toFixed(2)
    });
    
  } catch (error) {
    console.error('Error getting recycler stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving statistics'
    });
  }
};

// 🔧 ENHANCED: Get recycler's bids with item details
const getRecyclerBids = async (req, res) => {
  try {
    const recyclerId = req.user.id;
    
    const bidsQuery = `
      SELECT 
        b.*,
        e.type as item_type,
        e.dept as item_dept,
        e.category as item_category,
        e.serial_no as item_serial_no,
        e.unique_id as item_unique_id
      FROM bids b
      JOIN ewaste_items e ON b.ewaste_item_id = e.id
      WHERE b.recycler_id = $1
      ORDER BY b.created_at DESC
    `;
    
    const result = await pool.query(bidsQuery, [recyclerId]);
    
    res.json({
      success: true,
      bids: result.rows
    });
    
  } catch (error) {
    console.error('Error getting recycler bids:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving bids'
    });
  }
};

// 🔧 NEW: Get recycler's purchased items (accepted bids)
const getRecyclerPurchasedItems = async (req, res) => {
  try {
    const recyclerId = req.user.id;
    
    const purchasedQuery = `
      SELECT 
        b.*,
        e.type as item_type,
        e.dept as item_dept,
        e.category as item_category,
        e.serial_no as item_serial_no,
        e.unique_id as item_unique_id,
        e.hazard,
        e.data_sensitivity,
        e.date_decommissioned
      FROM bids b
      JOIN ewaste_items e ON b.ewaste_item_id = e.id
      WHERE b.recycler_id = $1 AND b.status = 'accepted'
      ORDER BY b.updated_at DESC
    `;
    
    const result = await pool.query(purchasedQuery, [recyclerId]);
    
    res.json({
      success: true,
      items: result.rows
    });
    
  } catch (error) {
    console.error('Error getting purchased items:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving purchased items'
    });
  }
};

// Get available e-waste items for bidding
const getAvailableItems = async (req, res) => {
  try {
    const recyclerId = req.user.id;
    
    // Get items that are available and don't have a bid from this recycler
    const itemsQuery = `
      SELECT DISTINCT e.*
      FROM ewaste_items e
      LEFT JOIN bids b ON e.id = b.ewaste_item_id AND b.recycler_id = $1
      WHERE e.status = 'available' AND b.id IS NULL
      ORDER BY e.created_at DESC
    `;
    
    const result = await pool.query(itemsQuery, [recyclerId]);
    
    res.json({
      success: true,
      items: result.rows
    });
    
  } catch (error) {
    console.error('Error getting available items:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving available items'
    });
  }
};

// Place a bid on an item
const placeBid = async (req, res) => {
  try {
    const { itemId, bidAmount, notes } = req.body;
    const recyclerId = req.user.id;
    
    // Validate input
    if (!itemId || !bidAmount || bidAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Item ID and valid bid amount are required'
      });
    }
    
    // Check if item exists and is available
    const itemCheck = await pool.query(
      'SELECT * FROM ewaste_items WHERE id = $1 AND status = $2',
      [itemId, 'available']
    );
    
    if (itemCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found or not available for bidding'
      });
    }
    
    // Check if recycler already has a bid on this item
    const existingBid = await pool.query(
      'SELECT * FROM bids WHERE ewaste_item_id = $1 AND recycler_id = $2',
      [itemId, recyclerId]
    );
    
    if (existingBid.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You have already placed a bid on this item'
      });
    }
    
    // Check recycler's quantity limit (optional business rule)
    const recyclerInfo = await pool.query(
      'SELECT quantity_permitted FROM recyclers WHERE id = $1',
      [recyclerId]
    );
    
    const pendingBids = await pool.query(
      'SELECT COUNT(*) FROM bids WHERE recycler_id = $1 AND status = $2',
      [recyclerId, 'pending']
    );
    
    if (pendingBids.rows[0].count >= recyclerInfo.rows[0].quantity_permitted) {
      return res.status(429).json({
        success: false,
        message: `You have reached your bidding limit of ${recyclerInfo.rows[0].quantity_permitted} pending bids`
      });
    }
    
    // Place the bid
    const bidResult = await pool.query(
      `INSERT INTO bids (ewaste_item_id, recycler_id, bid_amount, notes) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [itemId, recyclerId, bidAmount, notes || null]
    );
    
    res.status(201).json({
      success: true,
      message: 'Bid placed successfully',
      bid: bidResult.rows[0]
    });
    
  } catch (error) {
    console.error('Error placing bid:', error);
    res.status(500).json({
      success: false,
      message: 'Error placing bid'
    });
  }
};

// Get all bids for coordinators with enhanced data
const getAllBids = async (req, res) => {
  try {
    const coordinatorId = req.user.id;
    
    // Get bids for items added by this coordinator
    const bidsQuery = `
      SELECT 
        b.*,
        e.type as item_type,
        e.dept as item_dept,
        e.category as item_category,
        e.serial_no as item_serial_no,
        e.unique_id as item_unique_id,
        r.company_name as recycler_company,
        r.contact_person as recycler_contact,
        r.phone as recycler_phone,
        r.rating as recycler_rating
      FROM bids b
      JOIN ewaste_items e ON b.ewaste_item_id = e.id
      JOIN recyclers r ON b.recycler_id = r.id
      WHERE e.coordinator_id = $1
      ORDER BY b.created_at DESC
    `;
    
    const result = await pool.query(bidsQuery, [coordinatorId]);
    
    res.json({
      success: true,
      bids: result.rows
    });
    
  } catch (error) {
    console.error('Error getting bids:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving bids'
    });
  }
};

// Accept a bid
const acceptBid = async (req, res) => {
  try {
    const { bidId } = req.params;
    const { reason } = req.body;
    const coordinatorId = req.user.id;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verify the bid belongs to coordinator's item
      const bidCheck = await client.query(`
        SELECT b.*, e.coordinator_id, e.id as item_id
        FROM bids b
        JOIN ewaste_items e ON b.ewaste_item_id = e.id
        WHERE b.id = $1 AND e.coordinator_id = $2 AND b.status = 'pending'
      `, [bidId, coordinatorId]);
      
      if (bidCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Bid not found or already processed'
        });
      }
      
      const bid = bidCheck.rows[0];
      
      // Accept the bid
      await client.query(
        'UPDATE bids SET status = $1, notes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['accepted', reason || 'Bid accepted by coordinator', bidId]
      );
      
      // Update item status to sold
      await client.query(
        'UPDATE ewaste_items SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['sold', bid.item_id]
      );
      
      // Reject all other pending bids for this item
      await client.query(
        `UPDATE bids SET status = $1, notes = $2, updated_at = CURRENT_TIMESTAMP 
         WHERE ewaste_item_id = $3 AND id != $4 AND status = 'pending'`,
        ['rejected', 'Another bid was accepted for this item', bid.item_id, bidId]
      );
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Bid accepted successfully'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error accepting bid:', error);
    res.status(500).json({
      success: false,
      message: 'Error accepting bid'
    });
  }
};

// Reject a bid
const rejectBid = async (req, res) => {
  try {
    const { bidId } = req.params;
    const { reason } = req.body;
    const coordinatorId = req.user.id;
    
    // Verify the bid belongs to coordinator's item
    const bidCheck = await pool.query(`
      SELECT b.*
      FROM bids b
      JOIN ewaste_items e ON b.ewaste_item_id = e.id
      WHERE b.id = $1 AND e.coordinator_id = $2 AND b.status = 'pending'
    `, [bidId, coordinatorId]);
    
    if (bidCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bid not found or already processed'
      });
    }
    
    // Reject the bid
    await pool.query(
      'UPDATE bids SET status = $1, notes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      ['rejected', reason || 'Bid rejected by coordinator', bidId]
    );
    
    res.json({
      success: true,
      message: 'Bid rejected successfully'
    });
    
  } catch (error) {
    console.error('Error rejecting bid:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting bid'
    });
  }
};

// 🔧 NEW: Get coordinator dashboard statistics
const getCoordinatorStats = async (req, res) => {
  try {
    const coordinatorId = req.user.id;
    
    const statsQuery = `
      SELECT 
        COUNT(CASE WHEN status = 'available' THEN 1 END) as available_items,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_items,
        COUNT(*) as total_items,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as items_added_today
      FROM ewaste_items 
      WHERE coordinator_id = $1
    `;
    
    const bidsStatsQuery = `
      SELECT 
        COUNT(CASE WHEN b.status = 'pending' THEN 1 END) as pending_bids,
        COUNT(CASE WHEN b.status = 'accepted' THEN 1 END) as accepted_bids,
        COUNT(CASE WHEN b.status = 'rejected' THEN 1 END) as rejected_bids,
        COALESCE(SUM(CASE WHEN b.status = 'accepted' THEN b.bid_amount ELSE 0 END), 0) as total_revenue
      FROM bids b
      JOIN ewaste_items e ON b.ewaste_item_id = e.id
      WHERE e.coordinator_id = $1
    `;
    
    const itemsResult = await pool.query(statsQuery, [coordinatorId]);
    const bidsResult = await pool.query(bidsStatsQuery, [coordinatorId]);
    
    const itemStats = itemsResult.rows[0];
    const bidStats = bidsResult.rows[0];
    
    res.json({
      success: true,
      stats: {
        totalItems: parseInt(itemStats.total_items),
        availableItems: parseInt(itemStats.available_items),
        soldItems: parseInt(itemStats.sold_items),
        itemsAddedToday: parseInt(itemStats.items_added_today),
        pendingBids: parseInt(bidStats.pending_bids),
        acceptedBids: parseInt(bidStats.accepted_bids),
        rejectedBids: parseInt(bidStats.rejected_bids),
        totalRevenue: parseFloat(bidStats.total_revenue).toFixed(2)
      }
    });
    
  } catch (error) {
    console.error('Error getting coordinator stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving statistics'
    });
  }
};

module.exports = {
  getAvailableItems,
  placeBid,
  getRecyclerBids,
  getAllBids,
  acceptBid,
  rejectBid,
  getRecyclerStats,           // NEW
  getRecyclerPurchasedItems,  // NEW
  getCoordinatorStats         // NEW
};