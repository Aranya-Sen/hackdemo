const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const qrService = require('../services/qrGenerator');
const path = require('path');

class EWasteController {
  // Show form page
  async showForm(req, res) {
    try {
      res.render('ewaste/form', { message: null });
    } catch (error) {
      console.error('Error rendering form:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error loading form',
        error: error.message
      });
    }
  }

  // Create new e-waste item
  async createItem(req, res) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const {
        type,
        dept,
        serial_no,
        category,
        hazard,
        data_sensitivity,
        date_decommissioned,
        coordinator_id
      } = req.body;

      // Generate unique ID
      const unique_id = uuidv4();
      
      // Generate URL
      const website_name = process.env.WEBSITE_NAME || 'ewaste.college.edu';
      const item_url = `https://${website_name}/item/${unique_id}`;

      // Generate QR Code
      const { qrCodePath, svgData } = await qrService.generateQRCode(unique_id, item_url);

      // Insert into database
      const query = `
        INSERT INTO ewaste_items (
          unique_id, type, dept, serial_no, category, hazard, 
          data_sensitivity, date_decommissioned, item_url, 
          qr_code_path, qr_svg_data, coordinator_id, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;
      
      const values = [
        unique_id,
        type,
        dept,
        serial_no,
        category,
        hazard,
        data_sensitivity,
        date_decommissioned || null,
        item_url,
        qrCodePath,
        svgData,
        coordinator_id || null,
        'available'
      ];

      const result = await client.query(query, values);
      await client.query('COMMIT');
      
      // Check if request expects JSON response (for API calls)
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.json({
          success: true,
          message: `E-waste item created successfully!`,
          item: result.rows[0],
          unique_id: unique_id,
          qr_code_url: `/api/ewaste/qr/${unique_id}/png`
        });
      }
      
      res.render('ewaste/form', { 
        message: {
          type: 'success',
          text: `E-waste item created successfully! ID: ${unique_id}`,
          url: item_url,
          qrCode: qrCodePath,
          item: result.rows[0]
        }
      });
      
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error creating e-waste item:', err);
      
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(500).json({
          success: false,
          error: 'Error creating e-waste item. Please try again.'
        });
      }
      
      res.render('ewaste/form', { 
        message: {
          type: 'error',
          text: 'Error creating e-waste item. Please try again.'
        }
      });
    } finally {
      client.release();
    }
  }

  // Get all e-waste items
  async getAllItems(req, res) {
    try {
      const query = `
        SELECT ei.*, c.name as coordinator_name, c.department as coordinator_dept
        FROM ewaste_items ei
        LEFT JOIN coordinators c ON ei.coordinator_id = c.id
        ORDER BY ei.created_at DESC
      `;
      
      const result = await pool.query(query);
      
      // Check if this is an API request (JSON expected)
      if (req.route && req.route.path.includes('/api/')) {
        return res.json({
          success: true,
          items: result.rows,
          count: result.rows.length
        });
      }
      
      // Check content-type or accept headers for JSON
      if ((req.headers.accept && req.headers.accept.includes('application/json')) || 
          (req.headers['content-type'] && req.headers['content-type'].includes('application/json'))) {
        return res.json({
          success: true,
          items: result.rows,
          count: result.rows.length
        });
      }
      
      // For web requests, render EJS template
      res.render('ewaste/items', { items: result.rows });
    } catch (err) {
      console.error('Error fetching e-waste items:', err);
      
      // Always return JSON for API routes or JSON requests
      if ((req.route && req.route.path.includes('/api/')) ||
          (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(500).json({
          success: false,
          error: 'Error fetching e-waste items'
        });
      }
      
      // For web requests, return JSON error (since we don't have error.ejs)
      res.status(500).json({
        success: false,
        message: 'Error fetching e-waste items',
        error: err.message
      });
    }
  }

  // Get single e-waste item by unique_id
  async getItemById(req, res) {
    try {
      const { unique_id } = req.params;
      
      const query = `
        SELECT ei.*, c.name as coordinator_name, c.department as coordinator_dept,
               c.email as coordinator_email, c.phone as coordinator_phone
        FROM ewaste_items ei
        LEFT JOIN coordinators c ON ei.coordinator_id = c.id
        WHERE ei.unique_id = $1
      `;
      
      const result = await pool.query(query, [unique_id]);
      
      if (result.rows.length === 0) {
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
          return res.status(404).json({
            success: false,
            error: 'E-waste item not found'
          });
        }
        return res.status(404).json({ 
          success: false,
          message: 'E-waste item not found'
        });
      }
      
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.json({
          success: true,
          item: result.rows[0]
        });
      }
      
      // For web requests, render EJS template
      res.render('ewaste/item-detail', { item: result.rows[0] });
    } catch (err) {
      console.error('Error fetching e-waste item:', err);
      
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(500).json({
          success: false,
          error: 'Error fetching e-waste item'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error fetching e-waste item',
        error: err.message
      });
    }
  }

  // Get e-waste items by department
  async getItemsByDepartment(req, res) {
    try {
      const { dept } = req.params;
      
      const query = `
        SELECT ei.*, c.name as coordinator_name
        FROM ewaste_items ei
        LEFT JOIN coordinators c ON ei.coordinator_id = c.id
        WHERE ei.dept = $1
        ORDER BY ei.created_at DESC
      `;
      
      const result = await pool.query(query, [dept]);
      res.json({
        success: true,
        department: dept,
        items: result.rows,
        count: result.rows.length
      });
    } catch (err) {
      console.error('Error fetching items by department:', err);
      res.status(500).json({ 
        success: false,
        error: 'Error fetching items by department'
      });
    }
  }

  // Get e-waste items available for bidding
  async getAvailableItems(req, res) {
    try {
      const query = `
        SELECT ei.*, c.name as coordinator_name, c.department as coordinator_dept
        FROM ewaste_items ei
        LEFT JOIN coordinators c ON ei.coordinator_id = c.id
        WHERE ei.status = 'available'
        ORDER BY ei.created_at DESC
      `;
      
      const result = await pool.query(query);
      res.json({
        success: true,
        items: result.rows,
        count: result.rows.length
      });
    } catch (err) {
      console.error('Error fetching available items:', err);
      res.status(500).json({ 
        success: false,
        error: 'Error fetching available items'
      });
    }
  }

  // Update item status
  async updateItemStatus(req, res) {
    try {
      const { unique_id } = req.params;
      const { status } = req.body;
      
      const validStatuses = ['available', 'bidding', 'sold', 'recycled', 'disposed'];
      
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status'
        });
      }
      
      const query = `
        UPDATE ewaste_items 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE unique_id = $2
        RETURNING *
      `;
      
      const result = await pool.query(query, [status, unique_id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Item not found'
        });
      }
      
      res.json({
        success: true,
        message: `Item status updated to ${status}`,
        item: result.rows[0]
      });
    } catch (err) {
      console.error('Error updating item status:', err);
      res.status(500).json({ 
        success: false,
        error: 'Error updating item status'
      });
    }
  }

  // Download QR Code as PNG
  async downloadQRPNG(req, res) {
    try {
      const { unique_id } = req.params;
      const result = await pool.query('SELECT * FROM ewaste_items WHERE unique_id = $1', [unique_id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      const qrPath = `./public/qr/${unique_id}.png`;
      res.download(qrPath, `ewaste-${unique_id}-qr.png`);
    } catch (err) {
      console.error('Error downloading QR code:', err);
      res.status(500).json({ error: 'Error downloading QR code' });
    }
  }

  // Download QR Code as SVG
  async downloadQRSVG(req, res) {
    try {
      const { unique_id } = req.params;
      const result = await pool.query('SELECT qr_svg_data FROM ewaste_items WHERE unique_id = $1', [unique_id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Content-Disposition', `attachment; filename="ewaste-${unique_id}-qr.svg"`);
      res.send(result.rows[0].qr_svg_data);
    } catch (err) {
      console.error('Error downloading SVG QR code:', err);
      res.status(500).json({ error: 'Error downloading SVG QR code' });
    }
  }

  // API endpoint to get item data as JSON
  async getItemAPI(req, res) {
    try {
      const { unique_id } = req.params;
      
      const query = `
        SELECT ei.*, c.name as coordinator_name, c.department as coordinator_dept
        FROM ewaste_items ei
        LEFT JOIN coordinators c ON ei.coordinator_id = c.id
        WHERE ei.unique_id = $1
      `;
      
      const result = await pool.query(query, [unique_id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          success: false,
          error: 'Item not found' 
        });
      }
      
      res.json({
        success: true,
        item: result.rows[0]
      });
    } catch (err) {
      console.error('Error fetching item via API:', err);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  // Generate QR codes for existing items (bulk operation)
  async generateBulkQR(req, res) {
    try {
      const result = await pool.query('SELECT unique_id, item_url FROM ewaste_items WHERE qr_code_path IS NULL');
      const items = result.rows;
      
      const bulkResult = await qrService.generateBulkQRCodes(items);
      
      // Update database with new QR code paths
      for (const successItem of bulkResult.success) {
        await pool.query(
          'UPDATE ewaste_items SET qr_code_path = $1 WHERE unique_id = $2',
          [successItem.qr_path, successItem.unique_id]
        );
      }
      
      res.json({ 
        success: true,
        message: `Generated QR codes for ${bulkResult.success.length} items`,
        processed: bulkResult.success.length,
        failed: bulkResult.failed.length,
        total: bulkResult.total,
        failed_items: bulkResult.failed
      });
    } catch (err) {
      console.error('Error in bulk QR generation:', err);
      res.status(500).json({ 
        success: false,
        error: 'Error generating QR codes' 
      });
    }
  }

  // API-only method to get all items (for dashboard)
  async getAllItemsAPI(req, res) {
    try {
      const query = `
        SELECT ei.*, c.name as coordinator_name, c.department as coordinator_dept
        FROM ewaste_items ei
        LEFT JOIN coordinators c ON ei.coordinator_id = c.id
        ORDER BY ei.created_at DESC
      `;
      
      const result = await pool.query(query);
      
      res.json({
        success: true,
        items: result.rows,
        count: result.rows.length
      });
    } catch (err) {
      console.error('Error fetching e-waste items via API:', err);
      res.status(500).json({
        success: false,
        error: 'Error fetching e-waste items'
      });
    }
  }

  // Get items by coordinator ID (for coordinator dashboard)
  async getMyItems(req, res) {
    try {
      const coordinatorId = req.user.id; // From JWT middleware
      
      const query = `
        SELECT ei.*, c.name as coordinator_name, c.department as coordinator_dept
        FROM ewaste_items ei
        LEFT JOIN coordinators c ON ei.coordinator_id = c.id
        WHERE ei.coordinator_id = $1
        ORDER BY ei.created_at DESC
      `;
      
      const result = await pool.query(query, [coordinatorId]);
      
      res.json({
        success: true,
        items: result.rows,
        count: result.rows.length
      });
    } catch (err) {
      console.error('Error fetching coordinator items:', err);
      res.status(500).json({
        success: false,
        error: 'Error fetching your items'
      });
    }
  }

  // Get dashboard statistics
  async getDashboardStats(req, res) {
    try {
      const coordinatorId = req.user.id; // From JWT middleware
      
      const statsQuery = `
        SELECT 
          COUNT(*) as total_items,
          COUNT(CASE WHEN status = 'available' THEN 1 END) as available_items,
          COUNT(CASE WHEN status = 'bidding' THEN 1 END) as items_in_bidding,
          COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_items,
          COUNT(CASE WHEN status = 'recycled' THEN 1 END) as recycled_items,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as items_this_week,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as items_this_month
        FROM ewaste_items 
        WHERE coordinator_id = $1
      `;
      
      const result = await pool.query(statsQuery, [coordinatorId]);
      const stats = result.rows[0];
      
      // Convert string numbers to integers
      Object.keys(stats).forEach(key => {
        stats[key] = parseInt(stats[key]) || 0;
      });
      
      res.json({
        success: true,
        stats: stats
      });
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
      res.status(500).json({
        success: false,
        error: 'Error fetching dashboard statistics'
      });
    }
  }

  // API method for creating items from dashboard (with coordinator_id from token)
  async createItemAPI(req, res) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const coordinatorId = req.user.id; // From JWT middleware
      const {
        type,
        serial_no,
        category,
        hazard,
        data_sensitivity,
        date_decommissioned
      } = req.body;

      // Use coordinator's department from JWT
      const dept = req.user.department;

      // Generate unique ID
      const unique_id = uuidv4();
      
      // Generate URL
      const website_name = process.env.WEBSITE_NAME || 'ewaste.college.edu';
      const item_url = `https://${website_name}/item/${unique_id}`;

      // Generate QR Code (if qrService is available)
      let qrCodePath = null;
      let svgData = null;
      
      try {
        const qrResult = await qrService.generateQRCode(unique_id, item_url);
        qrCodePath = qrResult.qrCodePath;
        svgData = qrResult.svgData;
      } catch (qrError) {
        console.warn('QR code generation failed:', qrError.message);
        // Continue without QR code - can be generated later
      }

      // Insert into database
      const query = `
        INSERT INTO ewaste_items (
          unique_id, type, dept, serial_no, category, hazard, 
          data_sensitivity, date_decommissioned, item_url, 
          qr_code_path, qr_svg_data, coordinator_id, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;
      
      const values = [
        unique_id,
        type,
        dept,
        serial_no,
        category,
        hazard,
        data_sensitivity,
        date_decommissioned || null,
        item_url,
        qrCodePath,
        svgData,
        coordinatorId,
        'available'
      ];

      const result = await client.query(query, values);
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: `E-waste item created successfully!`,
        item: result.rows[0],
        unique_id: unique_id,
        qr_code_url: qrCodePath ? `/api/ewaste/qr/${unique_id}/png` : null
      });
      
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error creating e-waste item via API:', err);
      res.status(500).json({
        success: false,
        error: 'Error creating e-waste item. Please try again.'
      });
    } finally {
      client.release();
    }
  }
}

module.exports = new EWasteController();