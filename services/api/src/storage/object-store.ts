/**
 * Where evidence clips live. Clips are stored under their claimed SHA-256
 * (README "Media"), and the server re-hashes what actually arrived.
 *
 * - S3ObjectStore: SeaweedFS in development, any S3 store in production. Phones
 *   upload straight to it with a pre-signed URL.
 * - LocalObjectStore: disk or memory, for running without S3 and for tests. Phones
 *   upload through the API (PUT /v1/evidence/:id/content).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const clipKey = (sha256: string) => `clips/${sha256}`;

export interface ObjectStore {
  /** Where the phone sends the clip's bytes for evidence `evidenceId`. */
  uploadUrl(
    evidenceId: string,
    sha256: string,
    contentType: string,
  ): Promise<{ url: string; expiresAt: Date }>;
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** The object's bytes in chunks, or null when it was never uploaded. */
  read(key: string): Promise<AsyncIterable<Uint8Array> | null>;
  /** True when uploads go through the API's own content endpoint. */
  readonly acceptsApiUploads: boolean;
}

const UPLOAD_URL_TTL_S = 3600;

export class LocalObjectStore implements ObjectStore {
  readonly acceptsApiUploads = true;
  private readonly memory = new Map<string, Uint8Array>();

  /** `dir` null keeps objects in memory (tests). */
  constructor(
    private readonly apiBaseUrl: string,
    private readonly dir: string | null,
    private readonly now = () => new Date(),
  ) {}

  async uploadUrl(evidenceId: string) {
    return {
      url: `${this.apiBaseUrl}/v1/evidence/${evidenceId}/content`,
      expiresAt: new Date(this.now().getTime() + UPLOAD_URL_TTL_S * 1000),
    };
  }

  async put(key: string, bytes: Uint8Array) {
    if (!this.dir) {
      this.memory.set(key, bytes);
      return;
    }
    const file = this.fileFor(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }

  async read(key: string) {
    let bytes: Uint8Array | undefined;
    if (!this.dir) bytes = this.memory.get(key);
    else bytes = await readFile(this.fileFor(key)).catch(() => undefined);
    if (!bytes) return null;
    const chunk = bytes;
    return (async function* () {
      yield chunk;
    })();
  }

  private fileFor(key: string) {
    if (!this.dir) throw new Error('no directory');
    const resolved = path.resolve(this.dir, key);
    if (!resolved.startsWith(path.resolve(this.dir) + path.sep)) throw new Error('bad object key');
    return resolved;
  }
}

export interface S3Settings {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export async function createS3ObjectStore(
  settings: S3Settings,
  now = () => new Date(),
): Promise<ObjectStore> {
  const { S3Client, CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand } =
    await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    forcePathStyle: true, // SeaweedFS and most self-hosted S3 stores need path-style URLs
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  });
  // Create the bucket on first start, so a fresh SeaweedFS works without setup.
  try {
    await client.send(new HeadBucketCommand({ Bucket: settings.bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: settings.bucket }));
  }
  return {
    acceptsApiUploads: false,
    async uploadUrl(_evidenceId, sha256, contentType) {
      const command = new PutObjectCommand({
        Bucket: settings.bucket,
        Key: clipKey(sha256),
        ContentType: contentType,
      });
      const url = await getSignedUrl(client, command, { expiresIn: UPLOAD_URL_TTL_S });
      return { url, expiresAt: new Date(now().getTime() + UPLOAD_URL_TTL_S * 1000) };
    },
    async put(key, bytes) {
      await client.send(new PutObjectCommand({ Bucket: settings.bucket, Key: key, Body: bytes }));
    },
    async read(key) {
      try {
        const object = await client.send(
          new GetObjectCommand({ Bucket: settings.bucket, Key: key }),
        );
        return (object.Body as AsyncIterable<Uint8Array> | undefined) ?? null;
      } catch (error) {
        if ((error as { name?: string }).name === 'NoSuchKey') return null;
        throw error;
      }
    },
  };
}
