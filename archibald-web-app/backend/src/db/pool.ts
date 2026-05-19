import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import { logger } from '../logger';

type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  maxConnections: number;
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
    idleTimeoutMillis: 600000,   // 10 min — riduce churning connessioni idle
    connectionTimeoutMillis: 5000,
    keepAlive: true,             // mantiene connessioni vive tramite TCP keepalive
    keepAliveInitialDelayMillis: 10000,
  };

  const pool = new Pool(poolConfig);

  // Senza questo handler, un errore su una connessione idle emette un evento 'error'
  // non gestito → Node.js crasha con uncaughtException (exit code 0, Docker riavvia).
  pool.on('error', (err) => {
    logger.error('[DB Pool] Idle client error — la connessione verrà riciclata automaticamente', {
      message: err.message,
    });
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
