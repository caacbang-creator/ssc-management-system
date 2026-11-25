// One shared MySQL connection pool for the whole app
const mysql = require('mysql2/promise');

// TLS (encrypted connection) for the hosted database. Local XAMPP has no TLS, so it is
// switched on only when DB_SSL=true. DB_CA_CERT holds the provider's CA certificate
// (the text of ca.pem); without it Node's built-in list of trusted CAs is used.
function sslOptions() {
  if (process.env.DB_SSL !== 'true') return undefined;
  return {
    ca: process.env.DB_CA_CERT || undefined,
    rejectUnauthorized: true // refuse a server whose certificate cannot be verified
  };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: sslOptions(),
  waitForConnections: true,
  connectionLimit: 5, // free hosted databases allow only a few connections
  dateStrings: true
});

// Strict mode makes the database REFUSE bad values (e.g. an unknown ENUM status)
// instead of silently saving ''. XAMPP's MariaDB has it off by default.
const STRICT_MODE = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
pool.on('connection', (conn) => {
  conn.query(`SET SESSION sql_mode = '${STRICT_MODE}'`);
  // Hosted servers run on UTC; use Philippine time so CURDATE() and NOW() match the campus
  conn.query("SET SESSION time_zone = '+08:00'");
});

module.exports = pool;
module.exports.STRICT_MODE = STRICT_MODE;
module.exports.sslOptions = sslOptions;
