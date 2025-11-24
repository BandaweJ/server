import 'dotenv/config';
import { DataSource } from 'typeorm';
import { join } from 'path';

/**
 * Loads the correct .env file when running locally. Render already exposes
 * DATABASE_URL in the environment so we only need to hydrate when working
 * on developer machines.
 */
const envFile =
  process.env.NODE_ENV && process.env.NODE_ENV !== 'production'
    ? `.env.${process.env.NODE_ENV}`
    : '.env.development';

if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: envFile });
}

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: hasDatabaseUrl ? undefined : process.env.DB_HOST,
  port: hasDatabaseUrl
    ? undefined
    : process.env.DB_PORT
    ? parseInt(process.env.DB_PORT, 10)
    : 5432,
  username: hasDatabaseUrl ? undefined : process.env.DB_USER,
  password: hasDatabaseUrl ? undefined : process.env.DB_PASSWORD,
  database: hasDatabaseUrl ? undefined : process.env.DB_NAME,
  entities: [join(__dirname, 'src/**/*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations/**/*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  ssl: hasDatabaseUrl ? { rejectUnauthorized: false } : false,
  logging: false,
});

export default AppDataSource;

