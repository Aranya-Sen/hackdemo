const { pool } = require('../config/database');

// 🔧 ENHANCED: Get department leaderboard with real-time data
const getDepartmentLeaderboard = async (req, res) => {
  try {
    console.log('🔍 Getting department leaderboard data...');
    
    // Get department statistics with real-time counts
    const leaderboardQuery = `
      SELECT 
        dept as department,
        COUNT(*) as total_items,
        COUNT(CASE WHEN status = 'available' THEN 1 END) as available_items,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_items,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as items_added_today,
        COUNT(CASE WHEN DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as items_added_this_week,
        COUNT(CASE WHEN DATE(created_at) >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as items_added_this_month
      FROM ewaste_items 
      GROUP BY dept 
      ORDER BY total_items DESC, sold_items DESC
      LIMIT 20
    `;
    
    const result = await pool.query(leaderboardQuery);
    console.log('📊 Query result rows:', result.rows.length);
    
    // Add ranking and format data with underscore format (matching frontend expectations)
    const departments = result.rows.map((dept, index) => ({
      rank: index + 1,
      department: dept.department,
      total_items: parseInt(dept.total_items),           // ✅ underscore format
      available_items: parseInt(dept.available_items),   // ✅ underscore format
      sold_items: parseInt(dept.sold_items),             // ✅ underscore format
      items_added_today: parseInt(dept.items_added_today),
      items_added_this_week: parseInt(dept.items_added_this_week),
      items_added_this_month: parseInt(dept.items_added_this_month),
      trophy: index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : null
    }));
    
    // Get overall system statistics
    const systemStatsQuery = `
      SELECT 
        COUNT(*) as total_system_items,
        COUNT(CASE WHEN status = 'available' THEN 1 END) as total_available,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) as total_sold,
        COUNT(DISTINCT dept) as total_departments,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as items_today
      FROM ewaste_items
    `;
    
    const systemResult = await pool.query(systemStatsQuery);
    const systemStats = systemResult.rows[0];
    
    console.log('✅ Returning departments data:', departments.length, 'departments');
    
    res.json({
      success: true,
      departments: departments,  // ✅ Changed from 'leaderboard' to 'departments'
      systemStats: {
        totalItems: parseInt(systemStats.total_system_items),
        totalAvailable: parseInt(systemStats.total_available),
        totalSold: parseInt(systemStats.total_sold),
        totalDepartments: parseInt(systemStats.total_departments),
        itemsToday: parseInt(systemStats.items_today)
      },
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting department leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving leaderboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 🔧 NEW: Get trending departments (most active this week)
const getTrendingDepartments = async (req, res) => {
  try {
    const trendingQuery = `
      SELECT 
        dept as department,
        COUNT(*) as items_this_week,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as items_today
      FROM ewaste_items 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY dept 
      ORDER BY items_this_week DESC, items_today DESC
      LIMIT 10
    `;
    
    const result = await pool.query(trendingQuery);
    
    const trending = result.rows.map((dept, index) => ({
      rank: index + 1,
      department: dept.department,
      itemsThisWeek: parseInt(dept.items_this_week),
      itemsToday: parseInt(dept.items_today)
    }));
    
    res.json({
      success: true,
      trending: trending,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting trending departments:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving trending data'
    });
  }
};

// 🔧 NEW: Get department details
const getDepartmentDetails = async (req, res) => {
  try {
    const { department } = req.params;
    
    const detailsQuery = `
      SELECT 
        type,
        category,
        status,
        COUNT(*) as count,
        AVG(CASE WHEN status = 'sold' AND created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 ELSE 0 END) as disposal_rate
      FROM ewaste_items 
      WHERE dept = $1
      GROUP BY type, category, status
      ORDER BY count DESC
    `;
    
    const itemsQuery = `
      SELECT *
      FROM ewaste_items 
      WHERE dept = $1
      ORDER BY created_at DESC
      LIMIT 50
    `;
    
    const statsQuery = `
      SELECT 
        COUNT(*) as total_items,
        COUNT(CASE WHEN status = 'available' THEN 1 END) as available_items,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_items,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as items_today,
        COUNT(CASE WHEN DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as items_this_week,
        COUNT(CASE WHEN DATE(created_at) >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as items_this_month
      FROM ewaste_items 
      WHERE dept = $1
    `;
    
    const [detailsResult, itemsResult, statsResult] = await Promise.all([
      pool.query(detailsQuery, [department]),
      pool.query(itemsQuery, [department]),
      pool.query(statsQuery, [department])
    ]);
    
    if (statsResult.rows[0].total_items == 0) {
      return res.status(404).json({
        success: false,
        message: 'Department not found or has no items'
      });
    }
    
    res.json({
      success: true,
      department: department,
      stats: statsResult.rows[0],
      breakdown: detailsResult.rows,
      recentItems: itemsResult.rows,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting department details:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving department details'
    });
  }
};

module.exports = {
  getDepartmentLeaderboard,
  getTrendingDepartments,
  getDepartmentDetails
};