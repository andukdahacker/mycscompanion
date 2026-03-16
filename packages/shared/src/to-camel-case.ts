/**
 * Deep snake_case → camelCase converter for DB query results.
 * Converts Kysely result objects from snake_case DB columns to camelCase API fields.
 * Handles nested objects and arrays (Kysely results are often nested via joins).
 */

type CamelCase<S extends string> = S extends `${infer P}_${infer Q}`
  ? `${P}${Capitalize<CamelCase<Q>>}`
  : S

export type CamelCaseKeys<T> = T extends ReadonlyArray<infer U>
  ? Array<CamelCaseKeys<U>>
  : T extends Record<string, unknown>
    ? {
        [K in keyof T as K extends string ? CamelCase<K> : K]: CamelCaseKeys<T[K]>
      }
    : T

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
}

/**
 * Input is treated as readonly — this function never mutates its argument.
 * Note: Readonly<T> wrapper on the generic param breaks type inference
 * for null/unknown values. The readonly contract is enforced by convention.
 */
export function toCamelCase<T>(data: T): CamelCaseKeys<T> {
  if (Array.isArray(data)) {
    return data.map((item) => toCamelCase(item)) as CamelCaseKeys<T>
  }

  if (isRecord(data)) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      result[snakeToCamel(key)] = toCamelCase(value)
    }
    return result as CamelCaseKeys<T>
  }

  return data as CamelCaseKeys<T>
}
