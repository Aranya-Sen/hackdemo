const { pool } = require('../config/database');
const path = require('path');

class AdminController {
  // Show admin dashboard
  async showDashboard(req, res) {
    try {
      res.sendFile(path.join(__dirname, '../views/admin/dashboard.html'));
    } catch (error) {
      console.error('Error rendering admin dashboard:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error loading admin dashboard',
        error: error.message
      });
    }
  }

  // Get items currently in bidding status with their highest bids
// Get items currently in bidding status with their highest bids
async getItemsInBidding(req, res) {
  try {
    const query = `
      SELECT 
        ei.unique_id,
        ei.type,
        ei.serial_no,
        ei.dept,
        ei.status,
        ei.created_at,
        COALESCE(MAX(b.bid_amount), 0) as highest_bid,
        (SELECT r.company_name FROM recyclers r 
         JOIN bids b2 ON r.id = b2.recycler_id 
         WHERE b2.ewaste_item_id = ei.id 
         ORDER BY b2.bid_amount DESC 
         LIMIT 1) as winning_recycler,
        (SELECT b3.recycler_id FROM bids b3 
         WHERE b3.ewaste_item_id = ei.id 
         ORDER BY b3.bid_amount DESC 
         LIMIT 1) as recycler_id
      FROM ewaste_items ei
      LEFT JOIN bids b ON ei.id = b.ewaste_item_id
      WHERE ei.status = 'available'
      GROUP BY ei.id, ei.unique_id, ei.type, ei.serial_no, ei.dept, ei.status, ei.created_at
      ORDER BY ei.created_at DESC
    `;

    const result = await pool.query(query);
    
    res.json({
      success: true,
      items: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching bidding items:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bidding items',
      error: error.message
    });
  }
}

  // Close bidding for a specific item and assign to highest bidder
  async closeBidding(req, res) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const { item_id } = req.params;

      // Get the item details
      const itemQuery = `
        SELECT id, unique_id, type, serial_no 
        FROM ewaste_items 
        WHERE unique_id = $1 AND status = 'available'
      `;
      const itemResult = await client.query(itemQuery, [item_id]);

      if (itemResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Item not found or not in bidding status'
        });
      }

      const item = itemResult.rows[0];

      // Get the highest bid for this item
      const bidQuery = `
        SELECT b.*, r.company_name, r.id as recycler_id
        FROM bids b
        JOIN recyclers r ON b.recycler_id = r.id
        WHERE b.ewaste_item_id = $1 AND b.status = 'pending'
        ORDER BY b.bid_amount DESC
        LIMIT 1
      `;
      const bidResult = await client.query(bidQuery, [item.id]);

      if (bidResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'No bids found for this item'
        });
      }

      const winningBid = bidResult.rows[0];

      // Update the ewaste_items table:
      // 1. Change status to 'sold'
      // 2. Set coordinator_id to the winning recycler's ID
      const updateItemQuery = `
        UPDATE ewaste_items 
        SET status = 'sold', 
            coordinator_id = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE unique_id = $2
      `;
      await client.query(updateItemQuery, [winningBid.recycler_id, item_id]);

      // Delete all bids for this item
      const deleteBidsQuery = `
        DELETE FROM bids WHERE ewaste_item_id = $1
      `;
      await client.query(deleteBidsQuery, [item.id]);

      await client.query('COMMIT');

      console.log(`✅ Bidding closed for item ${item_id}:`);
      console.log(`   - Assigned to: ${winningBid.company_name} (ID: ${winningBid.recycler_id})`);
      console.log(`   - Winning bid: ₹${winningBid.bid_amount}`);
      console.log(`   - All bids deleted for item`);

      res.json({
        success: true,
        message: 'Bidding closed successfully',
        item: {
          unique_id: item_id,
          type: item.type,
          serial_no: item.serial_no
        },
        winningBid: {
          amount: winningBid.bid_amount,
          recyclerName: winningBid.company_name,
          recyclerId: winningBid.recycler_id
        },
        recyclerName: winningBid.company_name
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error closing bidding:', error);
      res.status(500).json({
        success: false,
        message: 'Error closing bidding',
        error: error.message
      });
    } finally {
      client.release();
    }
  }

  // Get items count by type for pie chart
  async getItemsByType(req, res) {
    try {
      const query = `
        SELECT 
          type,
          COUNT(*) as count
        FROM ewaste_items
        GROUP BY type
        ORDER BY count DESC
      `;

      const result = await pool.query(query);
      
      res.json({
        success: true,
        stats: result.rows,
        total: result.rows.reduce((sum, item) => sum + parseInt(item.count), 0)
      });
    } catch (error) {
      console.error('Error fetching items by type:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching statistics',
        error: error.message
      });
    }
  }

  // Get admin dashboard statistics
  async getDashboardStats(req, res) {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_items,
          COUNT(CASE WHEN status = 'available' THEN 1 END) as available_items,
          COUNT(CASE WHEN status = 'bidding' THEN 1 END) as items_in_bidding,
          COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_items,
          COUNT(CASE WHEN status = 'recycled' THEN 1 END) as recycled_items
        FROM ewaste_items
      `;
      
      const bidsQuery = `
        SELECT 
          COUNT(*) as total_bids,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bids,
          COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_bids,
          AVG(bid_amount) as average_bid
        FROM bids
      `;

      const [itemsResult, bidsResult] = await Promise.all([
        pool.query(statsQuery),
        pool.query(bidsQuery)
      ]);

      const itemStats = itemsResult.rows[0];
      const bidStats = bidsResult.rows[0];

      // Convert string numbers to integers
      Object.keys(itemStats).forEach(key => {
        if (key !== 'average_bid') {
          itemStats[key] = parseInt(itemStats[key]) || 0;
        }
      });

      Object.keys(bidStats).forEach(key => {
        if (key === 'average_bid') {
          bidStats[key] = parseFloat(bidStats[key]) || 0;
        } else {
          bidStats[key] = parseInt(bidStats[key]) || 0;
        }
      });
      
      res.json({
        success: true,
        stats: {
          items: itemStats,
          bids: bidStats
        }
      });
    } catch (error) {
      console.error('Error fetching admin dashboard stats:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching dashboard statistics',
        error: error.message
      });
    }
  }
}

module.exports = new AdminController();