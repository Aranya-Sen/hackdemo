const { Pool } = require('pg');

// PostgreSQL connection configuration
const pool = new Pool({
  user: process.env.DB_USER || 'your_username',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'inventory_db',
  password: process.env.DB_PASSWORD || 'your_password',
  port: process.env.DB_PORT || 5432,
});

// Database initialization
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // E-waste items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ewaste_items (
        id SERIAL PRIMARY KEY,
        unique_id VARCHAR(255) UNIQUE NOT NULL,
        type VARCHAR(255) NOT NULL,
        dept VARCHAR(255) NOT NULL,
        serial_no VARCHAR(255) NOT NULL,
        category VARCHAR(255) NOT NULL,
        hazard VARCHAR(255) NOT NULL,
        data_sensitivity VARCHAR(255) NOT NULL,
        date_decommissioned DATE,
        item_url VARCHAR(500) NOT NULL,
        qr_code_path VARCHAR(500),
        qr_svg_data TEXT,
        coordinator_id INTEGER,
        status VARCHAR(50) DEFAULT 'available',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Coordinators table
    await client.query(`
      CREATE TABLE IF NOT EXISTS coordinators (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        department VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        employee_id VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 🔧 UPDATED: Recyclers table with quantity_permitted instead of specialization
    await client.query(`
      CREATE TABLE IF NOT EXISTS recyclers (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20) NOT NULL,
        address TEXT,
        license_number VARCHAR(100) UNIQUE NOT NULL,
        quantity_permitted INTEGER DEFAULT 100,
        password_hash VARCHAR(255) NOT NULL,
        rating DECIMAL(3,2) DEFAULT 0.00,
        is_verified BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Bidding table
    await client.query(`
      CREATE TABLE IF NOT EXISTS bids (
        id SERIAL PRIMARY KEY,
        ewaste_item_id INTEGER REFERENCES ewaste_items(id) ON DELETE CASCADE,
        recycler_id INTEGER REFERENCES recyclers(id) ON DELETE CASCADE,
        bid_amount DECIMAL(10,2) NOT NULL,
        bid_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 🔧 NEW: Valid licenses table for verification
    await client.query(`
      CREATE TABLE IF NOT EXISTS valid_licenses (
        id SERIAL PRIMARY KEY,
        license_number VARCHAR(100) UNIQUE NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        issued_date DATE,
        expiry_date DATE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add foreign key constraint to ewaste_items
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_ewaste_coordinator'
        ) THEN
          ALTER TABLE ewaste_items 
          ADD CONSTRAINT fk_ewaste_coordinator 
          FOREIGN KEY (coordinator_id) REFERENCES coordinators(id);
        END IF;
      END $$;
    `);

    // 🔧 NEW: Insert sample valid licenses for testing
    await client.query(`
      INSERT INTO valid_licenses (license_number, company_name, issued_date, expiry_date, status)
      VALUES 
        ('LIC001', 'EcoRecycle Pvt Ltd', '2023-01-15', '2025-01-15', 'active'),
        ('LIC002', 'GreenTech Solutions', '2023-03-20', '2025-03-20', 'active'),
        ('LIC003', 'WasteWise Industries', '2023-05-10', '2025-05-10', 'active'),
        ('LIC004', 'RecyclePro Systems', '2023-02-28', '2025-02-28', 'active'),
        ('LIC005', 'EcoFriendly Corp', '2023-06-01', '2025-06-01', 'active'),
        ('LIC006', 'CleanCycle Ltd', '2023-04-12', '2025-04-12', 'active'),
        ('LIC007', 'GreenLoop Recycling', '2023-07-05', '2025-07-05', 'active'),
        ('LIC008', 'EcoTech Partners', '2023-08-18', '2025-08-18', 'active'),
        ('LIC009', 'Sustainable Solutions', '2023-09-22', '2025-09-22', 'active'),
        ('LIC010', 'CircularTech Inc', '2023-10-15', '2025-10-15', 'active')
      ON CONFLICT (license_number) DO NOTHING
    `);

    console.log('✅ PostgreSQL tables initialized successfully');
    console.log('✅ Sample license data inserted for testing');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Test database connection
async function testConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ PostgreSQL connection successful');
    return true;
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err);
    return false;
  }
}

// 🔧 NEW: License verification function
async function verifyLicense(licenseNumber) {
  try {
    const client = await pool.connect();
    const result = await client.query(
      `SELECT * FROM valid_licenses 
       WHERE license_number = $1 AND status = 'active' AND expiry_date > CURRENT_DATE`,
      [licenseNumber]
    );
    client.release();
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (err) {
    console.error('❌ License verification failed:', err);
    return null;
  }
}

module.exports = {
  pool,
  initializeDatabase,
  testConnection,
  verifyLicense
};