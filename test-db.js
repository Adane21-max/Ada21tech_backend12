const db = require('./config/db');

db.query('SELECT 1')
  .then(() => {
    console.log('✅ Database connection successful');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Database connection failed:');
    console.error('   Code:', err.code);
    console.error('   Message:', err.message);
    process.exit(1);
  });