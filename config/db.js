const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'test',
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