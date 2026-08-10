const { Pool, types } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// OID 1082 is the PostgreSQL DATE type. 
// We return the raw string (e.g. "2026-08-10") instead of converting it to a local JS Date object,
// preventing automatic timezone-shifting (which makes it previous day UTC).
types.setTypeParser(1082, val => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : {
    rejectUnauthorized: false // Neon/Cloud requires SSL, local database does not
  }
});

module.exports = pool;
