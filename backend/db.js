const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',                // use 'localhost' instead of '127.0.0.1' for compatibility
  user: 'root',                     // or your MySQL username
  password: '',                     // or your MySQL root password
  database: 'qr_attendance',        // make sure this DB exists
  port: 3308,                       // <-- Add the port here to match your XAMPP MySQL configuration
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+05:30'                // ✅ Set to Indian Standard Time (IST)
});

pool.getConnection()
  .then(() => console.log(' ✅ Connected to MySQL'))
  .catch(err => console.error('❌ MySQL Connection Error:', err));

module.exports = pool;
