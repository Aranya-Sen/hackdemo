const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool, verifyLicense } = require('../config/database');

// Generate JWT token
const generateToken = (recyclerId) => {
  return jwt.sign(
    { recyclerId },
    process.env.JWT_SECRET || 'your_jwt_secret_key_here',
    { expiresIn: '7d' }
  );
};

// Signup controller
const signup = async (req, res) => {
  const { 
    companyName, 
    contactPerson, 
    email, 
    phone, 
    address, 
    licenseNumber, 
    quantityPermitted, 
    password 
  } = req.body;
  
  const client = await pool.connect();
  
  try {
    // 1. Verify license number exists in valid_licenses table (SAME AS validateLicense)
    const licenseCheck = await client.query(
      'SELECT license_number FROM valid_licenses WHERE license_number = $1',
      [licenseNumber.trim()]
    );

    if (licenseCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired license number. Please contact administrator.'
      });
    }

    // 2. Check if recycler already exists
    const existingRecycler = await client.query(
      'SELECT id FROM recyclers WHERE email = $1 OR license_number = $2',
      [email, licenseNumber]
    );

    if (existingRecycler.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Recycler with this email or license number already exists'
      });
    }

    // 3. Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 4. Create new recycler
    const result = await client.query(
      `INSERT INTO recyclers (
        company_name, contact_person, email, phone, address, 
        license_number, quantity_permitted, password_hash, is_verified
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING id, company_name, contact_person, email, phone, license_number, quantity_permitted, is_verified, created_at`,
      [companyName, contactPerson, email, phone, address, licenseNumber, quantityPermitted || 100, hashedPassword, true]
    );

    const recycler = result.rows[0];

    // 5. Generate token
    const token = generateToken(recycler.id);

    res.status(201).json({
      success: true,
      message: 'Recycler account created successfully',
      data: {
        recycler: {
          id: recycler.id,
          companyName: recycler.company_name,
          contactPerson: recycler.contact_person,
          email: recycler.email,
          phone: recycler.phone,
          licenseNumber: recycler.license_number,
          quantityPermitted: recycler.quantity_permitted,
          isVerified: recycler.is_verified,
          createdAt: recycler.created_at
        },
        token
      }
    });

  } catch (error) {
    console.error('Recycler signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating recycler account',
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
    // Find recycler by email
    const result = await client.query(
      'SELECT * FROM recyclers WHERE email = $1 AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const recycler = result.rows[0];

    // Check if account is verified
    if (!recycler.is_verified) {
      return res.status(401).json({
        success: false,
        message: 'Account not verified. Please contact administrator.'
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, recycler.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login timestamp
    await client.query(
      'UPDATE recyclers SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [recycler.id]
    );

    // Generate token
    const token = generateToken(recycler.id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        recycler: {
          id: recycler.id,
          companyName: recycler.company_name,
          contactPerson: recycler.contact_person,
          email: recycler.email,
          phone: recycler.phone,
          licenseNumber: recycler.license_number,
          quantityPermitted: recycler.quantity_permitted,
          rating: recycler.rating,
          isVerified: recycler.is_verified
        },
        token
      }
    });

  } catch (error) {
    console.error('Recycler login error:', error);
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
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT id, company_name, contact_person, email, phone, address, 
              license_number, quantity_permitted, rating, is_verified, created_at, updated_at 
       FROM recyclers WHERE id = $1 AND is_active = true`,
      [req.recyclerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recycler not found'
      });
    }

    const recycler = result.rows[0];

    // Get recycler's bidding statistics
    const statsResult = await client.query(
      `SELECT 
         COUNT(*) as total_bids,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bids,
         COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_bids,
         COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_bids
       FROM bids WHERE recycler_id = $1`,
      [recycler.id]
    );

    const stats = statsResult.rows[0] || { 
      total_bids: 0, pending_bids: 0, accepted_bids: 0, rejected_bids: 0 
    };

    res.json({
      success: true,
      data: {
        recycler: {
          id: recycler.id,
          companyName: recycler.company_name,
          contactPerson: recycler.contact_person,
          email: recycler.email,
          phone: recycler.phone,
          address: recycler.address,
          licenseNumber: recycler.license_number,
          quantityPermitted: recycler.quantity_permitted,
          rating: parseFloat(recycler.rating) || 0,
          isVerified: recycler.is_verified,
          createdAt: recycler.created_at,
          updatedAt: recycler.updated_at
        },
        statistics: {
          totalBids: parseInt(stats.total_bids),
          pendingBids: parseInt(stats.pending_bids),
          acceptedBids: parseInt(stats.accepted_bids),
          rejectedBids: parseInt(stats.rejected_bids)
        }
      }
    });

  } catch (error) {
    console.error('Get recycler profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// recyclerController.js - getDashboard function
const getDashboard = async (req, res) => {
  console.log('Dashboard accessed by:', req.user?.id || req.recyclerId);
  console.log('User data:', req.user);
  const client = await pool.connect();
  
  try {
    // 1. Get recycler details
    const recyclerResult = await client.query(
      `SELECT id, company_name, contact_person, email, phone, license_number, 
              quantity_permitted, rating, is_verified
       FROM recyclers WHERE id = $1 AND is_active = true`,
      [req.recyclerId]
    );

    if (recyclerResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'Recycler not found' });
    }

    const recycler = recyclerResult.rows[0];

    // 2. Get available e-waste items
    const itemsResult = await client.query(
      `SELECT ei.*, c.name as coordinator_name, c.department 
       FROM ewaste_items ei
       LEFT JOIN coordinators c ON ei.coordinator_id = c.id
       WHERE ei.status = 'available'
       ORDER BY ei.created_at DESC`,
      []
    );

    // 3. Get recycler's bidding statistics
    const statsResult = await client.query(
      `SELECT 
         COUNT(*) as total_bids,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bids,
         COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_bids
       FROM bids WHERE recycler_id = $1`,
      [recycler.id]
    );

    const stats = statsResult.rows[0] || {
      total_bids: 0,
      pending_bids: 0,
      accepted_bids: 0
    };

    // 4. Get recent bids
    const recentBidsResult = await client.query(
      `SELECT b.*, ei.type, ei.category, ei.unique_id
       FROM bids b
       JOIN ewaste_items ei ON b.ewaste_item_id = ei.id
       WHERE b.recycler_id = $1
       ORDER BY b.created_at DESC
       LIMIT 5`,
      [recycler.id]
    );

    // 5. Get item categories for filtering
    const categoriesResult = await client.query(
      `SELECT DISTINCT category 
       FROM ewaste_items 
       WHERE status = 'available' 
       ORDER BY category`
    );

    // 6. Render dashboard
    res.render('recycler/dashboard', {
      title: 'Recycler Dashboard',
      recycler: {
        ...recycler,
        company_name: recycler.company_name,
        contact_person: recycler.contact_person,
        license_number: recycler.license_number,
        quantity_permitted: recycler.quantity_permitted,
        is_verified: recycler.is_verified
      },
      stats: {
        totalBids: parseInt(stats.total_bids),
        pendingBids: parseInt(stats.pending_bids),
        acceptedBids: parseInt(stats.accepted_bids),
        availableItems: itemsResult.rows.length
      },
      items: itemsResult.rows,
      recentBids: recentBidsResult.rows,
      categories: categoriesResult.rows.map(row => row.category)
    });

  } catch (error) {
    console.error('Recycler dashboard error:', error);
    res.status(500).render('error', { message: 'Error loading dashboard' });
  } finally {
    client.release();
  }
};

// Update profile controller
const updateProfile = async (req, res) => {
  const { companyName, contactPerson, phone, address, quantityPermitted } = req.body;
  const recyclerId = req.recyclerId;
  
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `UPDATE recyclers 
       SET company_name = $1, contact_person = $2, phone = $3, 
           address = $4, quantity_permitted = $5, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $6 AND is_active = true 
       RETURNING id, company_name, contact_person, email, phone, address, quantity_permitted`,
      [companyName, contactPerson, phone, address, quantityPermitted, recyclerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recycler not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        recycler: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Update recycler profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Verify license endpoint (for signup form validation)
const verifyLicenseEndpoint = async (req, res) => {
  const { licenseNumber } = req.body;
  
  try {
    const licenseData = await verifyLicense(licenseNumber);
    
    if (licenseData) {
      res.json({
        success: true,
        message: 'License verified successfully',
        data: {
          companyName: licenseData.company_name,
          issuedDate: licenseData.issued_date,
          expiryDate: licenseData.expiry_date
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired license number'
      });
    }
  } catch (error) {
    console.error('License verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying license'
    });
  }
};

const validateLicense = async (req, res) => {
  const { license_number } = req.body;

  if (!license_number) {
    return res.status(400).json({
      success: false,
      message: 'License number is required'
    });
  }

  const client = await pool.connect();

  try {
    // Check if license exists in valid_licenses table
    const result = await client.query(
      'SELECT license_number FROM valid_licenses WHERE license_number = $1',
      [license_number.trim()]
    );

    const isValid = result.rows.length > 0;

    res.json({
      success: true,
      valid: isValid,
      message: isValid ? 'Valid license' : 'Invalid license'
    });

  } catch (error) {
    console.error('License validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating license'
    });
  } finally {
    client.release();
  }
};

// Get items that were sold to this specific recycler
const getAcquiredItems = async (req, res) => {
  try {
    const recycler_id = req.recyclerId; // Use the correct property from auth middleware
    
    // Query ewaste_items where coordinator_id = recycler_id and status = 'sold'
    // This is where acquired items are stored after bidding closes
    const query = `
      SELECT 
        ei.*,
        c.name as coordinator_name,
        c.email as coordinator_email
      FROM ewaste_items ei
      LEFT JOIN coordinators c ON ei.coordinator_id = c.id  -- Original coordinator info
      WHERE ei.coordinator_id = $1 AND ei.status = 'sold'
      ORDER BY ei.updated_at DESC
    `;
    
    const result = await pool.query(query, [recycler_id]);
    
    console.log(`Found ${result.rows.length} acquired items for recycler ${recycler_id}`);
    
    res.render('recycler/acquired-items', { 
      items: result.rows,
      recycler: req.user || req.recycler
    });
  } catch (error) {
    console.error('Error fetching acquired items:', error);
    res.status(500).send('Server Error');
  }
};

const exportAcquiredItemsCSV = async (req, res) => {
  try {
    const recycler_id = req.recyclerId;
    
    // Get recycler details
    const recyclerQuery = `
      SELECT company_name, contact_person, email, phone, address, license_number
      FROM recyclers 
      WHERE id = $1
    `;
    const recyclerResult = await pool.query(recyclerQuery, [recycler_id]);
    
    if (recyclerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Recycler not found' });
    }
    
    const recycler = recyclerResult.rows[0];
    
    // Get acquired items
    const itemsQuery = `
      SELECT unique_id, type, serial_no, category, hazard, data_sensitivity
      FROM ewaste_items 
      WHERE coordinator_id = $1 AND status = 'sold'
      ORDER BY updated_at DESC
    `;
    const itemsResult = await pool.query(itemsQuery, [recycler_id]);
    
    // Generate CSV content
    let csvContent = '';
    
    // Add recycler information header
    csvContent += 'RECYCLER INFORMATION\n';
    csvContent += 'Company Name,Contact Person,Email,Phone,Address,License Number\n';
    csvContent += `"${recycler.company_name}","${recycler.contact_person}","${recycler.email}","${recycler.phone}","${recycler.address}","${recycler.license_number}"\n`;
    
    // Add empty line
    csvContent += '\n';
    
    // Add acquired items header
    csvContent += 'ACQUIRED ITEMS\n';
    csvContent += 'Unique ID,Type,Serial No,Category,Hazard Level,Data Sensitivity\n';
    
    // Add items data
    itemsResult.rows.forEach(item => {
      csvContent += `"${item.unique_id || ''}","${item.type || ''}","${item.serial_no || ''}","${item.category || ''}","${item.hazard || ''}","${item.data_sensitivity || ''}"\n`;
    });
    
    // Set response headers for CSV download
    const filename = `acquired_items_${recycler.company_name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');
    
    // Send CSV content
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error exporting acquired items CSV:', error);
    res.status(500).json({ success: false, message: 'Error generating CSV export' });
  }
};

module.exports = {
  signup,
  login,
  getProfile,
  updateProfile,
  getDashboard,
  verifyLicenseEndpoint,
  validateLicense,
  getAcquiredItems,
  exportAcquiredItemsCSV
};