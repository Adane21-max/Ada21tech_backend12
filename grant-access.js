const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

connection.connect(err => {
  if (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to MySQL');

  const grantSQL = `GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' IDENTIFIED BY '${process.env.DB_PASSWORD}' WITH GRANT OPTION`;
  
  connection.query(grantSQL, (err2) => {
    if (err2) {
      console.error('❌ GRANT failed:', err2.message);
    } else {
      console.log('✅ GRANT executed successfully');
    }
    connection.query('FLUSH PRIVILEGES', (err3) => {
      if (err3) console.error('❌ FLUSH PRIVILEGES failed:', err3.message);
      else console.log('✅ FLUSH PRIVILEGES executed');
      connection.end();
      process.exit(0);
    });
  });
});