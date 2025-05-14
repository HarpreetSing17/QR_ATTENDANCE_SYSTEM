const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'mysql-qrattendance.alwaysdata.net',   // ✅ Replace with your host from AlwaysData
  user: '412911',                        // ✅ Replace with your MySQL user from Permissions
  password: 'happy1727',                    // ✅ Replace with the password you set
  database: 'qrattendance_qr_attendance',      // ✅ Replace with your full database name
  port: 3306,                                   // AlwaysData uses default port 3306
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+05:30'                            // Indian Standard Time
});

pool.getConnection()
  .then(() => console.log(' ✅ Connected to AlwaysData MySQL'))
  .catch(err => console.error('❌ MySQL Connection Error:', err));

module.exports = pool;
