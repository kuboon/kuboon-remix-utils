import type {
  AdapterCapabilities,
  DatabaseAdapter,
  DataManipulationOperation,
  DataManipulationRequest,
  DataManipulationResult,
  SqlStatement,
  TableRef,
  TransactionOptions,
  TransactionToken,
} from '@remix-run/data-table'
import { getTablePrimaryKey } from '@remix-run/data-table'
import type {
  Client as TursoClient,
  InValue,
  ResultSet,
  Transaction as TursoTransaction,
  TransactionMode,
} from '@libsql/client'

import { compileSqliteOperation } from './sql-compiler.ts'

/**
 * Minimal async surface shared by the libSQL `Client` and `Transaction` types.
 *
 * Both accept `{ sql, args }` statements and multi-statement scripts, which is all the adapter
 * needs to route work to either the top-level client or an open interactive transaction.
 */
type TursoExecutor = {
  execute(statement: { sql: string; args: InValue[] }): Promise<ResultSet>
  executeMultiple(sql: string): Promise<void>
}

/**
 * `DatabaseAdapter` implementation for Turso / libSQL clients.
 *
 * Turso is SQLite over an async client, so this adapter speaks the SQLite dialect while awaiting
 * every driver call. Use it when `data-table-sqlite`'s synchronous client surface is not available,
 * such as with `@libsql/client` against a remote Turso database or an embedded replica.
 */
export class TursoDatabaseAdapter implements DatabaseAdapter {
  /**
   * The SQL dialect identifier reported by this adapter.
   */
  dialect = 'sqlite'

  /**
   * Feature flags describing the sqlite behaviors supported by this adapter.
   */
  capabilities: AdapterCapabilities

  #client: TursoClient
  #transactions = new Map<string, TursoTransaction>()
  #transactionCounter = 0

  constructor(client: TursoClient) {
    this.#client = client
    this.capabilities = {
      returning: true,
      savepoints: true,
      upsert: true,
      transactionalDdl: true,
      migrationLock: false,
    }
  }

  /**
   * Compiles a data-manipulation operation to sqlite SQL statements.
   * @param operation Operation to compile.
   * @returns Compiled SQL statements.
   */
  compileSql(operation: DataManipulationOperation): SqlStatement[] {
    let compiled = compileSqliteOperation(operation)
    return [{ text: compiled.text, values: compiled.values }]
  }

  /**
   * Executes a turso data-manipulation request.
   * @param request Request to execute.
   * @returns Execution result.
   */
  async execute(request: DataManipulationRequest): Promise<DataManipulationResult> {
    if (request.operation.kind === 'insertMany' && request.operation.values.length === 0) {
      return {
        affectedRows: 0,
        insertId: undefined,
        rows: request.operation.returning ? [] : undefined,
      }
    }

    let executor = this.#resolveExecutor(request.transaction)
    let statement = this.compileSql(request.operation)[0]
    let resultSet = await executor.execute({
      sql: statement.text,
      args: normalizeStatementValues(statement.values),
    })

    let rows = normalizeRows(resultSet.rows)

    if (request.operation.kind === 'count' || request.operation.kind === 'exists') {
      rows = normalizeCountRows(rows)
    }

    return {
      rows,
      affectedRows: normalizeAffectedRows(request.operation.kind, resultSet, rows),
      insertId: normalizeInsertId(request.operation.kind, request.operation, resultSet, rows),
    }
  }

  /**
   * Executes a multi-statement sqlite SQL script.
   * @param sql SQL script to execute.
   * @param transaction Optional transaction token (asserted when present).
   * @returns A promise that resolves once execution completes.
   */
  async executeScript(sql: string, transaction?: TransactionToken): Promise<void> {
    let executor = this.#resolveExecutor(transaction)
    await executor.executeMultiple(sql)
  }

  /**
   * Checks whether a table exists in sqlite.
   * @param table Table reference to inspect.
   * @param transaction Optional transaction token.
   * @returns `true` when the table exists.
   */
  async hasTable(table: TableRef, transaction?: TransactionToken): Promise<boolean> {
    let executor = this.#resolveExecutor(transaction)
    let masterTable = table.schema
      ? quoteIdentifier(table.schema) + '.sqlite_master'
      : 'sqlite_master'
    let resultSet = await executor.execute({
      sql: 'select 1 from ' + masterTable + ' where type = ? and name = ? limit 1',
      args: ['table', table.name],
    })
    return resultSet.rows.length > 0
  }

  /**
   * Checks whether a column exists in sqlite.
   * @param table Table reference to inspect.
   * @param column Column name to look up.
   * @param transaction Optional transaction token.
   * @returns `true` when the column exists.
   */
  async hasColumn(
    table: TableRef,
    column: string,
    transaction?: TransactionToken,
  ): Promise<boolean> {
    let executor = this.#resolveExecutor(transaction)
    let schemaPrefix = table.schema ? quoteIdentifier(table.schema) + '.' : ''
    let resultSet = await executor.execute({
      sql: 'pragma ' + schemaPrefix + 'table_info(' + quoteIdentifier(table.name) + ')',
      args: [],
    })

    return resultSet.rows.some((row) => row.name === column)
  }

  /**
   * Starts a turso interactive transaction.
   *
   * `readOnly` transactions open in libSQL's `read` mode; everything else opens in `write` mode so
   * the transaction can both read and write. Other {@link TransactionOptions} are accepted as
   * best-effort hints and ignored where libSQL has no equivalent.
   * @param options Transaction options.
   * @returns Transaction token.
   */
  async beginTransaction(options?: TransactionOptions): Promise<TransactionToken> {
    let mode: TransactionMode = options?.readOnly ? 'read' : 'write'
    let transaction = await this.#client.transaction(mode)

    this.#transactionCounter += 1
    let token = { id: 'tx_' + String(this.#transactionCounter) }
    this.#transactions.set(token.id, transaction)

    return token
  }

  /**
   * Commits an open turso transaction.
   * @param token Transaction token to commit.
   * @returns A promise that resolves when the transaction is committed.
   */
  async commitTransaction(token: TransactionToken): Promise<void> {
    let transaction = this.#transaction(token)

    try {
      await transaction.commit()
    } finally {
      this.#transactions.delete(token.id)
    }
  }

  /**
   * Rolls back an open turso transaction.
   * @param token Transaction token to roll back.
   * @returns A promise that resolves when the transaction is rolled back.
   */
  async rollbackTransaction(token: TransactionToken): Promise<void> {
    let transaction = this.#transaction(token)

    try {
      await transaction.rollback()
    } finally {
      this.#transactions.delete(token.id)
    }
  }

  /**
   * Creates a savepoint in an open turso transaction.
   * @param token Transaction token to use.
   * @param name Savepoint name.
   * @returns A promise that resolves when the savepoint is created.
   */
  async createSavepoint(token: TransactionToken, name: string): Promise<void> {
    let transaction = this.#transaction(token)
    await transaction.execute({ sql: 'savepoint ' + quoteIdentifier(name), args: [] })
  }

  /**
   * Rolls back to a savepoint in an open turso transaction.
   * @param token Transaction token to use.
   * @param name Savepoint name.
   * @returns A promise that resolves when the rollback completes.
   */
  async rollbackToSavepoint(token: TransactionToken, name: string): Promise<void> {
    let transaction = this.#transaction(token)
    await transaction.execute({ sql: 'rollback to savepoint ' + quoteIdentifier(name), args: [] })
  }

  /**
   * Releases a savepoint in an open turso transaction.
   * @param token Transaction token to use.
   * @param name Savepoint name.
   * @returns A promise that resolves when the savepoint is released.
   */
  async releaseSavepoint(token: TransactionToken, name: string): Promise<void> {
    let transaction = this.#transaction(token)
    await transaction.execute({ sql: 'release savepoint ' + quoteIdentifier(name), args: [] })
  }

  #resolveExecutor(token: TransactionToken | undefined): TursoExecutor {
    if (!token) {
      return this.#client
    }

    return this.#transaction(token)
  }

  #transaction(token: TransactionToken): TursoTransaction {
    let transaction = this.#transactions.get(token.id)

    if (!transaction) {
      throw new Error('Unknown transaction token: ' + token.id)
    }

    return transaction
  }
}

/**
 * Creates a turso `DatabaseAdapter`.
 * @param client libSQL client (for example from `@libsql/client`).
 * @returns A configured turso adapter.
 * @example
 * ```ts
 * import { createClient } from '@libsql/client'
 * import { createDatabase } from '@remix-run/data-table'
 * import { createTursoDatabaseAdapter } from '@kuboon/remix-data-table-sqlite-turso'
 *
 * let client = createClient({
 *   url: process.env.TURSO_DATABASE_URL,
 *   authToken: process.env.TURSO_AUTH_TOKEN,
 * })
 * let adapter = createTursoDatabaseAdapter(client)
 * let db = createDatabase(adapter)
 * ```
 */
export function createTursoDatabaseAdapter(client: TursoClient): TursoDatabaseAdapter {
  return new TursoDatabaseAdapter(client)
}

function normalizeRows(rows: unknown[]): Record<string, unknown>[] {
  return rows.map((row) => {
    if (typeof row !== 'object' || row === null) {
      return {}
    }

    return { ...(row as Record<string, unknown>) }
  })
}

function normalizeStatementValues(values: unknown[]): InValue[] {
  return values.map((value) => (value === undefined ? null : value)) as InValue[]
}

function normalizeCountRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    let count = row.count

    if (typeof count === 'string') {
      let numeric = Number(count)

      if (!Number.isNaN(numeric)) {
        return {
          ...row,
          count: numeric,
        }
      }
    }

    if (typeof count === 'bigint') {
      return {
        ...row,
        count: Number(count),
      }
    }

    return row
  })
}

function normalizeAffectedRows(
  kind: DataManipulationRequest['operation']['kind'],
  resultSet: ResultSet,
  rows: Record<string, unknown>[],
): number | undefined {
  if (kind === 'select' || kind === 'count' || kind === 'exists') {
    return undefined
  }

  // libSQL reports `rowsAffected` as `0` for `returning` writes, so fall back to the returned row
  // count whenever the operation produced rows.
  if (isWriteOperationKind(kind) && rows.length > 0) {
    return rows.length
  }

  if (kind === 'raw' && rows.length > 0) {
    return undefined
  }

  return Number(resultSet.rowsAffected)
}

function normalizeInsertId(
  kind: DataManipulationRequest['operation']['kind'],
  operation: DataManipulationRequest['operation'],
  resultSet: ResultSet,
  rows: Record<string, unknown>[],
): unknown {
  if (!isInsertOperationKind(kind) || !isInsertOperation(operation)) {
    return undefined
  }

  let primaryKey = getTablePrimaryKey(operation.table)

  if (primaryKey.length !== 1) {
    return undefined
  }

  if (rows.length > 0) {
    let key = primaryKey[0]
    let row = rows[rows.length - 1]
    return row ? row[key] : undefined
  }

  return resultSet.lastInsertRowid === undefined ? undefined : Number(resultSet.lastInsertRowid)
}

function quoteIdentifier(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"'
}

function isWriteOperationKind(kind: DataManipulationRequest['operation']['kind']): boolean {
  return (
    kind === 'insert' ||
    kind === 'insertMany' ||
    kind === 'update' ||
    kind === 'delete' ||
    kind === 'upsert'
  )
}

function isInsertOperationKind(kind: DataManipulationRequest['operation']['kind']): boolean {
  return kind === 'insert' || kind === 'insertMany' || kind === 'upsert'
}

function isInsertOperation(
  operation: DataManipulationRequest['operation'],
): operation is Extract<
  DataManipulationRequest['operation'],
  { kind: 'insert' | 'insertMany' | 'upsert' }
> {
  return (
    operation.kind === 'insert' || operation.kind === 'insertMany' || operation.kind === 'upsert'
  )
}
