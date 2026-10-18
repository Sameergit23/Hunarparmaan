import { EntityId } from '@hunarpramaan/contracts';
import type { Request } from 'express';
import { z } from 'zod';
import { parse } from './validate';

/** `:id` route parameter as a UUID, or 400. */
export const idParam = (req: Request) => parse(EntityId, req.params.id);

/** `:id` as a short opaque code (certificate ids). */
export const codeParam = (req: Request) => parse(z.string().trim().min(3).max(40), req.params.id);
