import { Pool, PoolConfig } from 'pg';

let pool: Pool | undefined;

export function getDbPool(): Pool {
  if (!pool) {
    let config: PoolConfig = {};

    if (process.env.DATABASE_URL) {
      config = { connectionString: process.env.DATABASE_URL };
    } else {
      const host = process.env.PGHOST || process.env.DB_HOST;
      const port = process.env.PGPORT || process.env.DB_PORT;
      const user = process.env.PGUSER || process.env.DB_USER;
      const password = process.env.PGPASSWORD || process.env.DB_PASSWORD;
      const database = process.env.PGDATABASE || process.env.DB_NAME;

      if (!host || !user || !database) {
        throw new Error(
          'Database connection credentials are missing. ' +
          'Please set DATABASE_URL or PGHOST/PGUSER/PGDATABASE or DB_HOST/DB_USER/DB_NAME in environment variables.'
        );
      }

      config = {
        host,
        port: port ? parseInt(port, 10) : 5432,
        user,
        password,
        database,
      };
    }

    pool = new Pool(config);
  }
  return pool;
}
