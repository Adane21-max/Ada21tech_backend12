const mysql = require('mysql2');

// Railway automatically injects MYSQL* variables when linked to a MySQL service
const host = process.env.MYSQLHOST || process.env.DB_HOST;
const port = process.env.MYSQLPORT || process.env.DB_PORT || 3306;
const user = process.env.MYSQLUSER || process.env.DB_USER;
const password = process.env.MYSQLPASSWORD || process.env.DB_PASSWORD;
const database = process.env.MYSQLDATABASE || process.env.DB_NAME || 'railway';

console.log('🔄 Attempting MySQL connection (Railway Internal):');
console.log(`   Host: ${host}`);
console.log(`   Port: ${port}`);
console.log(`   User: ${user}`);
console.log(`   Database: ${database}`);
console.log(`   Password: ${password ? '***' : 'NOT SET'}`);

const pool = mysql.createPool({
  host: host,
  port: port,
  user: user,
  password: password,
  database: database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Attempt to grant remote access immediately after pool creation
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Initial connection failed:', err.message);
    return;
  }
  console.log('✅ Initial connection successful');

  // Grant privileges to root from any host
  const grantSQL = `GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' IDENTIFIED BY ? WITH GRANT OPTION`;
  connection.query(grantSQL, [password], (grantErr) => {
    if (grantErr) {
      console.error('⚠️ GRANT failed (may already exist):', grantErr.message);
    } else {
      console.log('✅ GRANT executed successfully');
    }
    connection.query('FLUSH PRIVILEGES', (flushErr) => {
      if (flushErr) console.error('⚠️ FLUSH PRIVILEGES failed:', flushErr.message);
      else console.log('✅ FLUSH PRIVILEGES executed');
      connection.release();
    });
  });
});

// Regular connection test (this will be used by the app)
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