const fs = require('fs');
const path = require('path');
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/DATABASE_URL=([^\r\n]+)/);
const dbUrl = match[1].trim();
const pgPath = path.resolve(__dirname, '../lib/db/node_modules/pg');
const { Pool } = require(pgPath);
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

async function seed() {
  console.log("Seeding users and inventory for Ved Koli, Ayush Jadhav, Chaudhari Murli, and Admin...");

  // 1. Admin
  await pool.query(`
    INSERT INTO inventory_user_profiles (clerk_user_id, email, name, role, updated_at)
    VALUES ('user_admin_bhise', 'bhiseaditya46@gmail.com', 'Aditya Bhise (Admin)', 'admin', NOW())
    ON CONFLICT (clerk_user_id) DO UPDATE SET role = 'admin', name = 'Aditya Bhise (Admin)';
  `);
  await pool.query(`
    INSERT INTO inventory_admin_users (clerk_user_id, email)
    VALUES ('user_admin_bhise', 'bhiseaditya46@gmail.com')
    ON CONFLICT (clerk_user_id) DO NOTHING;
  `);

  // 2. Normal Users
  const users = [
    { id: 'user_vedkoli_101', email: 'vedkoli@example.com', name: 'Ved Koli', role: 'user' },
    { id: 'user_ayush_102', email: 'ayush.jadhav@example.com', name: 'Ayush Jadhav', role: 'user' },
    { id: 'user_murli_103', email: 'chaudhari.murli@example.com', name: 'Chaudhari Murli', role: 'user' }
  ];

  for (const u of users) {
    await pool.query(`
      INSERT INTO inventory_user_profiles (clerk_user_id, email, name, role, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (clerk_user_id) DO UPDATE SET name = $3, email = $2, role = $4;
    `, [u.id, u.email, u.name, u.role]);
  }

  // 3. Products
  const products = [
    // Ved Koli's items
    { owner: 'user_vedkoli_101', sku: 'TOOL-01', name: 'Precision Screwdriver Set (64-Piece)', cat: 'Tools', qty: 25, reorder: 5, cost: 8.50, price: 19.99, supp: 'Apex Tool Group', desc: 'Precision magnetic bit set for electronics' },
    { owner: 'user_vedkoli_101', sku: 'FAST-100', name: 'Stainless Machine Fasteners M4 (Pack of 100)', cat: 'Hardware', qty: 45, reorder: 10, cost: 4.00, price: 11.50, supp: 'Fastenal Co.', desc: 'Corrosion resistant steel screws' },
    { owner: 'user_vedkoli_101', sku: 'ELEC-90', name: 'Digital Multimeter & Voltage Tester', cat: 'Electronics', qty: 3, reorder: 5, cost: 18.00, price: 39.99, supp: 'Fluke Direct', desc: 'Auto-ranging LCD display' },

    // Ayush Jadhav's items
    { owner: 'user_ayush_102', sku: 'ACC-01', name: 'Ergonomic Wireless Mouse', cat: 'Peripherals', qty: 30, reorder: 8, cost: 12.00, price: 29.99, supp: 'Logitech Dist.', desc: '2.4GHz quiet click wireless mouse' },
    { owner: 'user_ayush_102', sku: 'ACC-02', name: 'Mechanical Gaming Keyboard RGB', cat: 'Peripherals', qty: 14, reorder: 5, cost: 35.00, price: 79.99, supp: 'Keychron Wholesale', desc: 'Hot-swappable brown switches' },
    { owner: 'user_ayush_102', sku: 'FAST-100', name: 'USB-C 7-in-1 Power Delivery Hub', cat: 'Electronics', qty: 0, reorder: 5, cost: 14.00, price: 34.50, supp: 'Anker Direct', desc: '100W PD 4K HDMI multi-port hub' },

    // Chaudhari Murli's items
    { owner: 'user_murli_103', sku: 'PWR-01', name: 'Cordless Brushless Hammer Drill 20V', cat: 'Power Tools', qty: 12, reorder: 3, cost: 65.00, price: 129.99, supp: 'DeWalt Industrial', desc: 'High torque cordless drill with 2 batteries' },
    { owner: 'user_murli_103', sku: 'MEAS-50', name: 'Laser Distance Meter 50M', cat: 'Measuring', qty: 2, reorder: 5, cost: 22.00, price: 49.99, supp: 'Bosch Professional', desc: 'Precision digital laser measurement tool' },
    { owner: 'user_murli_103', sku: 'SAFE-10', name: 'Safety Eyewear Anti-Fog (Pack of 10)', cat: 'Safety Gear', qty: 50, reorder: 10, cost: 9.00, price: 24.99, supp: '3M Safety', desc: 'Scratch-resistant ANSI Z87.1 approved glasses' }
  ];

  for (const p of products) {
    const res = await pool.query(
      'SELECT id FROM inventory_products WHERE owner_user_id = $1 AND LOWER(sku) = LOWER($2)',
      [p.owner, p.sku]
    );
    if (res.rows.length === 0) {
      await pool.query(`
        INSERT INTO inventory_products (owner_user_id, sku, name, category, quantity, reorder_level, cost_price, unit_price, supplier, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [p.owner, p.sku, p.name, p.cat, p.qty, p.reorder, p.cost, p.price, p.supp, p.desc]);
    }
  }

  console.log("✓ Seeding complete. All 3 users and their custom inventory items are active in PostgreSQL!");
  await pool.end();
}

seed().catch(err => {
  console.error("Seed error:", err);
  process.exit(1);
});
