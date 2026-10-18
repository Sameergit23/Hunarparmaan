/**
 * JSON Canonicalization Scheme (RFC 8785).
 *
 * The same bytes must come out on the phone (Hermes) and on the server (Node),
 * because both hash them. RFC 8785 is defined in terms of ECMAScript's own
 * JSON serialisation, so we lean on JSON.stringify for strings and numbers and
 * only add the parts it does not do: sorted keys and strict input checks.
 */

const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

export class CanonicalizationError extends Error {
  override name = 'CanonicalizationError';
}

/** Serialise a JSON value to its RFC 8785 canonical form. */
export function canonicalize(value: unknown): string {
  return serialize(value, '$');
}

function serialize(value: unknown, path: string): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new CanonicalizationError(`${path}: ${String(value)} is not valid JSON`);
      }
      // ECMAScript Number-to-String is exactly what RFC 8785 section 3.2.2.3 asks for.
      return JSON.stringify(value);
    case 'string':
      if (LONE_SURROGATE.test(value)) {
        throw new CanonicalizationError(`${path}: string contains a lone surrogate`);
      }
      return JSON.stringify(value);
    case 'object':
      return Array.isArray(value) ? serializeArray(value, path) : serializeObject(value, path);
    default:
      throw new CanonicalizationError(`${path}: ${typeof value} is not valid JSON`);
  }
}

function serializeArray(items: readonly unknown[], path: string): string {
  const parts = items.map((item, i) => {
    if (item === undefined) {
      // JSON.stringify would silently write null here, which changes the hash.
      throw new CanonicalizationError(`${path}[${i}]: undefined is not valid JSON`);
    }
    return serialize(item, `${path}[${i}]`);
  });
  return `[${parts.join(',')}]`;
}

function serializeObject(obj: object, path: string): string {
  const proto: unknown = Object.getPrototypeOf(obj);
  if (proto !== Object.prototype && proto !== null) {
    // Dates, Maps, class instances: make the caller pick a JSON form explicitly.
    throw new CanonicalizationError(`${path}: only plain objects can be canonicalised`);
  }

  const record = obj as Record<string, unknown>;
  // Default sort compares UTF-16 code units, which is the order RFC 8785 requires.
  const keys = Object.keys(record).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const member = record[key];
    // Skip undefined members, as JSON.stringify does: once the object is sent
    // as JSON the key is gone, so the receiver hashes the same bytes.
    if (member === undefined) continue;
    if (LONE_SURROGATE.test(key)) {
      throw new CanonicalizationError(`${path}: key contains a lone surrogate`);
    }
    parts.push(`${JSON.stringify(key)}:${serialize(member, `${path}.${key}`)}`);
  }
  return `{${parts.join(',')}}`;
}
