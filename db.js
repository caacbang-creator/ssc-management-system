// One shared MySQL connection pool for the whole app
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true
});

// Strict mode makes the database REFUSE bad values (e.g. an unknown ENUM status)
// instead of silently saving ''. XAMPP's MariaDB has it off by default.
const STRICT_MODE = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
pool.on('connection', (conn) => {
  conn.query(`SET SESSION sql_mode = '${STRICT_MODE}'`);
});

module.exports = pool;
module.exports.STRICT_MODE = STRICT_MODE;
