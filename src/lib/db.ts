import { Pool } from 'pg';

let pool: Pool | undefined;

export function getDbPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });
  }
  return pool;
}
