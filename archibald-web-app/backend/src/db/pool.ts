import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  maxConnections: number;
};

type DbPool = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
  end: () => Promise<void>;
  getStats: () => { totalCount: number; idleCount: number; waitingCount: number };
};

function createPool(dbConfig: DatabaseConfig): DbPool {
  const poolConfig: PoolConfig = {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    max: dbConfig.maxConnections,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  const pool = new Pool(poolConfig);

  return {
    query: <T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ) => pool.query<T>(text, params),
    end: () => pool.end(),
    getStats: () => ({
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    }),
  };
}

export { createPool, type DbPool, type DatabaseConfig };
