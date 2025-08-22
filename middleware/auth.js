const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// General purpose authentication middleware (for coordinators)
const protect = async (req, res, next) => {
  let token;

  // Get token from header first (for API requests with localStorage)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
    } catch (error) {
      console.error('Token extraction error:', error);
    }
  }

  // Also check for token in cookies (for browser requests)
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'coordinatorToken') {
        token = value;
        break;
      }
    }
  }

  // If no token found, return error
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
  }

  const client = await pool.connect();

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');

    // Get coordinator from database
    const result = await client.query(
      'SELECT id, name, email, department, phone, employee_id, is_active FROM coordinators WHERE id = $1',
      [decoded.coordinatorId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Token is not valid. Coordinator not found.'
      });
    }

    const coordinator = result.rows[0];

    if (!coordinator.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.'
      });
    }

    // Set coordinator data in request
    req.coordinatorId = decoded.coordinatorId;
    req.coordinator = coordinator;

    // Set req.user for compatibility
    req.user = {
      id: decoded.coordinatorId,
      name: coordinator.name,
      email: coordinator.email,
      department: coordinator.department,
      phone: coordinator.phone,
      employee_id: coordinator.employee_id,
      is_active: coordinator.is_active
    };

    next();

  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token is not valid.'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  } finally {
    client.release();
  }
};

// Coordinator-specific authentication middleware
const authenticateCoordinator = async (req, res, next) => {
  let token;
  console.log('🔍 Auth Debug:');
  console.log('Request path:', req.path);
  console.log('Request headers cookie:', req.headers.cookie);
  console.log('Request headers authorization:', req.headers.authorization);
  // Check Authorization header first (for frontend using localStorage)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
    } catch (error) {
      console.error('Token extraction error:', error);
    }
  }

  // Check cookies as fallback
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'coordinatorToken') {
        token = value;
        break;
      }
    }
  }
console.log('Final token status:', token ? 'FOUND' : 'NOT FOUND');

  if (!token) {
    // For web pages, redirect to login
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect('/coordinator/login');
    }
    // For API requests, return JSON
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
  }

  const client = await pool.connect();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');

    // Get coordinator from database
    const result = await client.query(
      'SELECT id, name, email, department, phone, employee_id, is_active FROM coordinators WHERE id = $1',
      [decoded.coordinatorId]
    );

    if (result.rows.length === 0) {
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return res.redirect('/coordinator/login');
      }
      return res.status(401).json({
        success: false,
        message: 'Token is not valid. Coordinator not found.'
      });
    }

    const coordinator = result.rows[0];

    if (!coordinator.is_active) {
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return res.redirect('/coordinator/login');
      }
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.'
      });
    }

    // Set data in request object
    req.coordinatorId = decoded.coordinatorId;
    req.coordinator = coordinator;
    req.user = {
      id: decoded.coordinatorId,
      name: coordinator.name,
      email: coordinator.email,
      department: coordinator.department,
      phone: coordinator.phone,
      employee_id: coordinator.employee_id,
      is_active: coordinator.is_active,
      role: 'coordinator'
    };

    next();

  } catch (error) {
    console.error('Coordinator auth error:', error);
    
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect('/coordinator/login');
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token is not valid.'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  } finally {
    client.release();
  }
};

// Recycler-specific authentication middleware
// Recycler-specific authentication middleware
const authenticateRecycler = async (req, res, next) => {
  let token;

  // Check Authorization header first (for frontend using localStorage)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
    } catch (error) {
      console.error('Token extraction error:', error);
    }
  }

  // Check cookies as fallback
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'recyclerToken') {
        token = value;
        break;
      }
    }
  }

  // FIXED: Single token check with proper logic
  if (!token) {
    // For web pages, redirect to login
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect('/recycler/login');
    }
    // For API requests, return JSON
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
  }

  const client = await pool.connect();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');

    // Get recycler from database - NOTE: recyclerId from your token payload
    const result = await client.query(
      `SELECT id, company_name, contact_person, email, phone, 
              license_number, quantity_permitted, rating, is_verified, is_active 
       FROM recyclers WHERE id = $1`,
      [decoded.recyclerId]  // This matches your recyclerController.js token payload
    );

    if (result.rows.length === 0) {
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return res.redirect('/recycler/login');
      }
      return res.status(401).json({
        success: false,
        message: 'Token is not valid. Recycler not found.'
      });
    }

    const recycler = result.rows[0];

    if (!recycler.is_active) {
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return res.redirect('/recycler/login');
      }
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.'
      });
    }

    if (!recycler.is_verified) {
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return res.redirect('/recycler/login');
      }
      return res.status(401).json({
        success: false,
        message: 'Account not verified. Please contact administrator.'
      });
    }

    // Set data in request object - matching your recyclerController.js expectations
    req.recyclerId = decoded.recyclerId;
    req.recycler = recycler;
    req.user = {
      id: decoded.recyclerId,
      companyName: recycler.company_name,
      contactPerson: recycler.contact_person,
      email: recycler.email,
      phone: recycler.phone,
      licenseNumber: recycler.license_number,
      quantityPermitted: recycler.quantity_permitted,
      rating: recycler.rating,
      isVerified: recycler.is_verified,
      isActive: recycler.is_active,
      role: 'recycler'
    };

    next();

  } catch (error) {
    console.error('Recycler auth error:', error);
    
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect('/recycler/login');
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token is not valid.'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  } finally {
    client.release();
  }
};

module.exports = { 
  protect, 
  authenticateCoordinator, 
  authenticateRecycler 
};