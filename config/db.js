const mysql = require('mysql2');
require('dotenv').config();

const host = process.env.DB_HOST || process.env.MYSQLHOST;
const port = process.env.DB_PORT || process.env.MYSQLPORT || 3306;
const user = process.env.DB_USER || process.env.MYSQLUSER;
const password = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD;
const database = process.env.DB_NAME || process.env.MYSQLDATABASE;

console.log('🔄 Attempting MySQL connection:');
console.log(`   Host: ${host}`);
console.log(`   Port: ${port}`);
console.log(`   User: ${user}`);
console.log(`   Database: ${database}`);
console.log(`   Password: ${password ? '***' : 'NOT SET'}`);

const pool = mysql.createPool({
  host: host,
  user: user,
  password: password,
  database: database,
  port: port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: host?.includes('proxy.rlwy.net') ? { rejectUnauthorized: false } : false,
  connectTimeout: 10000, // 10 seconds
});

// Test the connection immediately
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ MySQL Connection Failed:');
    console.error('   Code:', err.code);
    console.error('   Message:', err.message);
    console.error('   Fatal:', err.fatal);
  } else {
    console.log('✅ MySQL Connected successfully');
    connection.release();
  }
});

module.exports = pool.promise();