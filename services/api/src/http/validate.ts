import type { z } from 'zod';
import { badRequest, zodDetails } from './errors';

/** Parse a request body or query with a contracts schema, or answer 400. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest('The request is not valid', zodDetails(result.error));
  return result.data;
}
