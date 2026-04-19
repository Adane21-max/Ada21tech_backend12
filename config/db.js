const mysql = require('mysql2');

// Hardcode the correct database name to eliminate any ambiguity
const host = process.env.DB_HOST;
const port = process.env.DB_PORT;
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const database = 'defaultdb';   // <-- FORCE defaultdb

console.log('🔄 Attempting MySQL connection (Aiven):');
console.log(`   Host: ${host}`);
console.log(`   Port: ${port}`);
console.log(`   User: ${user}`);
console.log(`   Database: ${database}`);
console.log(`   Password: ${password ? '***' : 'NOT SET'}`);

if (!host || !user || !password) {
  console.error('❌ Missing required database environment variables.');
  process.exit(1);
}

const pool = mysql.createPool({
  host: host,
  port: port,
  user: user,
  password: password,
  database: database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }
});

pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ MySQL Connection Failed:', err.message);
    return;
  }
  console.log('✅ MySQL Connected successfully');
  connection.query('SHOW TABLES', (err2, results) => {
    if (!err2) {
      const tables = results.map(row => Object.values(row)[0]);
      console.log('📋 Tables in database:', tables.join(', '));
    }
    connection.release();
  });
});

module.exports = pool.promise();