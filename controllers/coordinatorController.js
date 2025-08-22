const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// Generate JWT token
const generateToken = (coordinatorId) => {
  return jwt.sign(
    { coordinatorId },
    process.env.JWT_SECRET || 'your_jwt_secret_key_here',
    { expiresIn: '7d' }
  );
};

// Signup controller
const signup = async (req, res) => {
  const { name, email, department, phone, employeeId, password } = req.body;
  
  const client = await pool.connect();
  
  try {
    // Check if coordinator already exists
    const existingCoordinator = await client.query(
      'SELECT id FROM coordinators WHERE email = $1 OR employee_id = $2',
      [email, employeeId]
    );

    if (existingCoordinator.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Coordinator with this email or employee ID already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new coordinator
    const result = await client.query(
      `INSERT INTO coordinators (name, email, department, phone, employee_id, password_hash) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, name, email, department, phone, employee_id, created_at`,
      [name, email, department, phone, employeeId, hashedPassword]
    );

    const coordinator = result.rows[0];

    // Generate token
    const token = generateToken(coordinator.id);

    res.status(201).json({
      success: true,
      message: 'Coordinator account created successfully',
      data: {
        coordinator: {
          id: coordinator.id,
          name: coordinator.name,
          email: coordinator.email,
          department: coordinator.department,
          phone: coordinator.phone,
          employeeId: coordinator.employee_id,
          createdAt: coordinator.created_at
        },
        token
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating coordinator account',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Login controller
const login = async (req, res) => {
  const { email, password } = req.body;
  
  const client = await pool.connect();
  
  try {
    // Find coordinator by email
    const result = await client.query(
      'SELECT * FROM coordinators WHERE email = $1 AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const coordinator = result.rows[0];

    // Check password
    const isValidPassword = await bcrypt.compare(password, coordinator.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login timestamp
    await client.query(
      'UPDATE coordinators SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [coordinator.id]
    );

    // Generate token
    const token = generateToken(coordinator.id);
    
    // ADD THIS DEBUG LOGGING:
    /*console.log('🔐 Login Debug:');
    console.log('Generated token:', token.substring(0, 20) + '...');
    console.log('Coordinator ID:', coordinator.id);
    console.log('Setting cookie with token');*/

    // 🔧 CRITICAL FIX: Set cookie AND return JSON response
    res.cookie('coordinatorToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax'
    });
    
    //console.log('✅ Cookie set, sending response');
    // Return JSON for frontend to handle
    res.json({
      success: true,
      message: 'Login successful',
      redirect: '/coordinator/dashboard',
      data: {
        coordinator: {
          id: coordinator.id,
          name: coordinator.name,
          email: coordinator.email,
          department: coordinator.department,
          phone: coordinator.phone,
          employeeId: coordinator.employee_id
        },
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Get profile controller
const getProfile = async (req, res) => {
  try {
    const coordinatorId = req.user.id;
    
    const result = await pool.query(
      'SELECT id, name, email, department, phone, employee_id, created_at FROM coordinators WHERE id = $1',
      [coordinatorId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Coordinator not found'
      });
    }
    
    res.json({
      success: true,
      coordinator: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error getting coordinator profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving profile'
    });
  }
};

// Update profile controller
const updateProfile = async (req, res) => {
  const { name, phone, department } = req.body;
  const coordinatorId = req.coordinatorId;
  
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `UPDATE coordinators 
       SET name = $1, phone = $2, department = $3, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $4 AND is_active = true 
       RETURNING id, name, email, department, phone, employee_id`,
      [name, phone, department, coordinatorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Coordinator not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        coordinator: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Change password controller
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const coordinatorId = req.coordinatorId;
  
  const client = await pool.connect();
  
  try {
    // Get current password hash
    const result = await client.query(
      'SELECT password_hash FROM coordinators WHERE id = $1 AND is_active = true',
      [coordinatorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Coordinator not found'
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash);

    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await client.query(
      'UPDATE coordinators SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedNewPassword, coordinatorId]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error changing password',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Enhanced getDashboard controller with EJS error handling
const getDashboard = async (req, res) => {
  console.log('Dashboard accessed by:', req.user?.id);
  
  try {
    const coordinatorId = req.user.id;
    
    // Get coordinator info
    const coordinatorResult = await pool.query(
      'SELECT * FROM coordinators WHERE id = $1',
      [coordinatorId]
    );
    
    if (coordinatorResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Coordinator not found'
      });
    }
    
    const coordinator = coordinatorResult.rows[0];
    
    // Get statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_items,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as items_added_today
      FROM ewaste_items 
      WHERE coordinator_id = $1
    `;
    
    const itemsResult = await pool.query(statsQuery, [coordinatorId]);
    
    const bidsStatsQuery = `
      SELECT 
        COUNT(CASE WHEN b.status = 'pending' THEN 1 END) as pending_bids,
        COUNT(CASE WHEN b.status = 'accepted' THEN 1 END) as accepted_bids,
        COALESCE(SUM(CASE WHEN b.status = 'accepted' THEN b.bid_amount ELSE 0 END), 0) as total_revenue
      FROM bids b
      JOIN ewaste_items e ON b.ewaste_item_id = e.id
      WHERE e.coordinator_id = $1
    `;
    
    const bidsResult = await pool.query(bidsStatsQuery, [coordinatorId]);
    
    const itemStats = itemsResult.rows[0];
    const bidStats = bidsResult.rows[0];
    
    const dashboardData = {
      coordinator: coordinator,
      stats: {
        totalItems: parseInt(itemStats.total_items),
        itemsAddedToday: parseInt(itemStats.items_added_today),
        pendingBids: parseInt(bidStats.pending_bids),
        acceptedBids: parseInt(bidStats.accepted_bids),
        totalRevenue: parseFloat(bidStats.total_revenue).toFixed(2)
      }
    };
    
    console.log('About to render with data:', dashboardData);
    
    // Add explicit error handling for the render
    res.render('coordinator/dashboard', dashboardData, (err, html) => {
      if (err) {
        console.error('EJS RENDER ERROR:', err);
        console.error('Error details:', {
          message: err.message,
          filename: err.filename,
          lineno: err.lineno
        });
        
        // Send a simple HTML response instead
        res.send(`
          <h1>EJS Render Error</h1>
          <p><strong>Error:</strong> ${err.message}</p>
          <p><strong>File:</strong> ${err.filename}</p>
          <p><strong>Line:</strong> ${err.lineno}</p>
          <p><strong>Data passed:</strong></p>
          <pre>${JSON.stringify(dashboardData, null, 2)}</pre>
        `);
        return;
      }
      
      //console.log('EJS render successful, sending HTML');
      res.send(html);
    });
    
  } catch (error) {
    console.error('DASHBOARD ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading dashboard',
      error: error.message
    });
  }
};

module.exports = {
  signup,
  login,
  getProfile,
  updateProfile,
  changePassword,
  getDashboard
};