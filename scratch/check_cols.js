const { Pool } = require('pg');
const pool = new Pool({ host:'202.83.121.156', port:5433, user:'cici', password:'clickup123', database:'cici', ssl:false });

pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='projects' ORDER BY ordinal_position")
  .then(r => { console.log(r.rows.map(x => x.column_name).join('\n')); pool.end(); })
  .catch(e => { console.error(e.message); process.exit(1); });
