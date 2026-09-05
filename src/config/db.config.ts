import { DataSourceOptions } from "typeorm";
import { DataSource } from "typeorm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const getDatabaseConfig = (): DataSourceOptions => ({
  type: "postgres",
  ...(process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "5432", 10),
        username: process.env.DB_USERNAME || "root",
        password: process.env.DB_PASSWORD || "root",
        database: process.env.DB_DATABASE || "sr4dx-dev-db",
      }),
  entities: [path.join(dirname, "../entities/**/*.js")],
  logging: false,
  synchronize: true,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const dataSource = new DataSource(getDatabaseConfig());
export default dataSource;
