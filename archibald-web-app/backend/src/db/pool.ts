import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  maxConnections: number;
  ssl?: boolean;
};

type TxClient = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
};

type DbPool = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
  withTransaction: <T>(fn: (tx: TxClient) => Promise<T>) => Promise<T>;
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
    ssl: dbConfig.ssl ? { rejectUnauthorized: false } : undefined,
  };

  const pool = new Pool(poolConfig);

  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error', err);
  });

  return {
    query: <T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ) => pool.query<T>(text, params),
    withTransaction: async <T>(fn: (tx: TxClient) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const txClient: TxClient = {
          query: <T2 extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
            client.query<T2>(text, params),
        };
        const result = await fn(txClient);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
    getStats: () => ({
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    }),
  };
}

export { createPool, type DbPool, type TxClient, type DatabaseConfig };
