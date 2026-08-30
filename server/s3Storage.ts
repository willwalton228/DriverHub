import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { Response } from "express";
import { Readable } from "stream";

export function isS3Configured(): boolean {
  return !!(
    process.env.S3_BUCKET &&
    process.env.S3_REGION &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  );
}

function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION!,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
}

function getBucket(): string {
  return process.env.S3_BUCKET!;
}

const EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export class S3StorageService {
  async uploadFile(
    fileBuffer: Buffer,
    contentType: string,
    originalFilename?: string
  ): Promise<{ objectPath: string; uploadURL: string }> {
    const objectId = randomUUID();
    const extension = originalFilename
      ? (originalFilename.split(".").pop() || "").toLowerCase()
      : EXTENSION_MAP[contentType] || "";
    const key = `uploads/${objectId}${extension ? `.${extension}` : ""}`;

    console.log(
      `[S3] Uploading ${fileBuffer.length} bytes to s3://${getBucket()}/${key} (${contentType})`
    );

    const client = getS3Client();

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: getBucket(),
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
        })
      );

      console.log(`[S3] Upload successful: ${key}`);
      const objectPath = `/objects/${key}`;
      return { objectPath, uploadURL: objectPath };
    } catch (error: any) {
      console.error(`[S3] Upload failed: ${error.message}`);

      const enhancedError = new Error(`S3 upload failed: ${error.message}`);
      (enhancedError as any).originalError = error;

      if (
        error.name === "CredentialsError" ||
        error.name === "InvalidAccessKeyId" ||
        error.name === "SignatureDoesNotMatch" ||
        error.Code === "InvalidAccessKeyId" ||
        error.Code === "SignatureDoesNotMatch" ||
        error.$metadata?.httpStatusCode === 403
      ) {
        (enhancedError as any).errorCode = "STORAGE_AUTH_FAILED";
        (enhancedError as any).errorDetails =
          "S3 credentials are invalid or expired. Check S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.";
      } else if (
        error.name === "NoSuchBucket" ||
        error.Code === "NoSuchBucket"
      ) {
        (enhancedError as any).errorCode = "STORAGE_NOT_CONFIGURED";
        (enhancedError as any).errorDetails = `S3 bucket "${getBucket()}" does not exist. Check S3_BUCKET.`;
      } else if (
        error.name === "NetworkingError" ||
        error.code === "ECONNREFUSED" ||
        error.code === "ENOTFOUND"
      ) {
        (enhancedError as any).errorCode = "STORAGE_UNREACHABLE";
        (enhancedError as any).errorDetails =
          "Cannot reach S3. Check S3_REGION and network connectivity.";
      } else {
        (enhancedError as any).errorCode = "STORAGE_ERROR";
        (enhancedError as any).errorDetails = error.message;
      }

      throw enhancedError;
    }
  }

  async serveFile(objectPath: string, res: Response): Promise<void> {
    const key = objectPath.replace(/^\/objects\//, "");

    const client = getS3Client();

    try {
      const headResult = await client.send(
        new HeadObjectCommand({
          Bucket: getBucket(),
          Key: key,
        })
      );

      const getResult = await client.send(
        new GetObjectCommand({
          Bucket: getBucket(),
          Key: key,
        })
      );

      res.set({
        "Content-Type": headResult.ContentType || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      });
      if (headResult.ContentLength) {
        res.set("Content-Length", String(headResult.ContentLength));
      }

      const body = getResult.Body;
      if (body instanceof Readable) {
        body.pipe(res);
      } else if (body && typeof (body as any).transformToByteArray === "function") {
        const bytes = await (body as any).transformToByteArray();
        res.end(Buffer.from(bytes));
      } else {
        res.status(500).json({ error: "Unexpected S3 response format" });
      }
    } catch (error: any) {
      if (error.name === "NoSuchKey" || error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        res.status(404).json({ error: "File not found" });
      } else {
        console.error(`[S3] Serve error for ${key}:`, error.message);
        res.status(500).json({ error: "Error retrieving file" });
      }
    }
  }

  async downloadAsBytes(objectPath: string): Promise<Buffer> {
    const key = objectPath.replace(/^\/objects\//, "");
    const client = getS3Client();

    const result = await client.send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: key,
      })
    );

    const body = result.Body;
    if (body && typeof (body as any).transformToByteArray === "function") {
      const bytes = await (body as any).transformToByteArray();
      return Buffer.from(bytes);
    } else if (body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
    throw new Error("Unexpected S3 response format");
  }

  async uploadToKey(
    key: string,
    fileBuffer: Buffer,
    contentType: string
  ): Promise<void> {
    const client = getS3Client();

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: getBucket(),
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
        })
      );
      console.log(`[S3] Upload to key successful: ${key}`);
    } catch (error: any) {
      console.error(`[S3] Upload to key failed: ${error.message}`);
      throw error;
    }
  }

  async downloadByKey(key: string): Promise<Buffer> {
    const client = getS3Client();

    const result = await client.send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: key,
      })
    );

    const body = result.Body;
    if (body && typeof (body as any).transformToByteArray === "function") {
      const bytes = await (body as any).transformToByteArray();
      return Buffer.from(bytes);
    } else if (body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
    throw new Error("Unexpected S3 response format");
  }

  async deleteByKey(key: string): Promise<void> {
    const client = getS3Client();

    await client.send(
      new DeleteObjectCommand({
        Bucket: getBucket(),
        Key: key,
      })
    );
    console.log(`[S3] Deleted key: ${key}`);
  }

  async deleteFile(objectPath: string): Promise<void> {
    const key = objectPath.replace(/^\/objects\//, "");
    const client = getS3Client();

    await client.send(
      new DeleteObjectCommand({
        Bucket: getBucket(),
        Key: key,
      })
    );
    console.log(`[S3] Deleted: ${key}`);
  }

  async uploadFileWithKey(key: string, fileBuffer: Buffer, contentType: string): Promise<void> {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      })
    );
    console.log(`[S3] Upload with key successful: ${key}`);
  }

  async getSignedUploadUrl(key: string, contentType: string, ttlSec: number): Promise<string> {
    const client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(client, command, { expiresIn: ttlSec });
  }

  async getSignedDownloadUrl(key: string, ttlSec: number): Promise<string> {
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    });
    return getSignedUrl(client, command, { expiresIn: ttlSec });
  }

  async fileExists(objectPath: string): Promise<boolean> {
    const key = objectPath.replace(/^\/objects\//, "");
    const client = getS3Client();

    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: getBucket(),
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}
