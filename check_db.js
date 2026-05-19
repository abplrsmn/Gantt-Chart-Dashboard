const { Pool } = require("pg");
const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || "5433"),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

pool.query("SELECT * FROM master_acc WHERE email = 'pm@aryaduta.com'")
  .then(res => { console.dir(res.rows, {depth: null}); pool.end(); })
  .catch(err => { console.error(err.message); pool.end(); });
