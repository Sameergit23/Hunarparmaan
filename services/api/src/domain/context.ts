import { v7 as uuidv7 } from 'uuid';
import type { Config } from '../config';
import type { Db } from '../db/client';
import type { JobQueue } from '../queue/queue';
import type { ObjectStore } from '../storage/object-store';

/** Everything the domain code needs, passed in so tests can control time and chance. */
export interface Deps {
  db: Db;
  config: Config;
  store: ObjectStore;
  queue: JobQueue;
  now: () => Date;
  /** A number in [0, 1); decides the random 10% re-score sample. */
  random: () => number;
  newId: () => string;
}

export function defaultClock() {
  return { now: () => new Date(), random: Math.random, newId: () => uuidv7() };
}
