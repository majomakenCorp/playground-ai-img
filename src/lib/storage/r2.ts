import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

let client: S3Client | null = null;
let bucket: string | null = null;

export function r2Configured(): boolean {
  return Boolean(
    env.R2_ENDPOINT &&
      env.R2_BUCKET &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY,
  );
}

function getClient(): { client: S3Client; bucket: string } {
  if (!r2Configured()) {
    throw new Error("R2 is not configured");
  }
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
    bucket = env.R2_BUCKET!;
  }
  return { client, bucket: bucket! };
}

export async function r2Put(
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
}

export async function r2GetBytes(key: string): Promise<Buffer> {
  const { client, bucket } = getClient();
  const out = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!out.Body) throw new Error("empty body");
  const chunks: Buffer[] = [];
  for await (const chunk of out.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function r2Head(key: string): Promise<boolean> {
  const { client, bucket } = getClient();
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404) return false;
    throw err;
  }
}
