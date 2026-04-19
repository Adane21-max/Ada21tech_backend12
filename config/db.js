const mysql = require('mysql2');

// 从环境变量读取配置，如果缺失则立即报错退出
const host = process.env.DB_HOST;
const port = process.env.DB_PORT;
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const database = process.env.DB_NAME;   // 必须从环境变量读取

console.log('🔄 Attempting MySQL connection (TiDB) - ENV CHECK:');
console.log('   DB_HOST:', host || 'MISSING');
console.log('   DB_PORT:', port || 'MISSING');
console.log('   DB_USER:', user || 'MISSING');
console.log('   DB_NAME:', database || 'MISSING');
console.log('   DB_PASSWORD:', password ? '***' : 'MISSING');

if (!host || !user || !password || !database) {
  console.error('❌ FATAL: Missing required database environment variables.');
  console.error('   Required: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME');
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
    console.error('❌ MySQL Connection Failed:');
    console.error('   Code:', err.code);
    console.error('   Message:', err.message);
  } else {
    console.log('✅ MySQL Connected successfully (TiDB)');
    connection.release();
  }
});

module.exports = pool.promise();