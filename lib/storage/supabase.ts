import http from "node:http";
import https from "node:https";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
import type { StorageAdapter } from "./adapter";

const BUCKET = "resume-files";
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour — matches security rules

function getSupabaseClient(): SupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, {
    auth: {
      // Service-role clients must not persist sessions
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// Lazily initialised so env vars are resolved at call-time, not module load-time
let _client: SupabaseClient | undefined;

function client(): SupabaseClient {
  if (!_client) {
    _client = getSupabaseClient();
  }
  return _client;
}

export class SupabaseStorageAdapter implements StorageAdapter {
  /**
   * Upload a file to Supabase Storage and return a signed URL.
   *
   * @param path      Storage object path relative to the bucket root (e.g. "user-id/resume.pdf")
   * @param file      Raw file bytes
   * @param mimeType  MIME type such as "application/pdf"
   * @returns         A signed URL valid for SIGNED_URL_EXPIRY_SECONDS seconds
   */
  async upload(
    path: string,
    file: Buffer,
    mimeType: string
  ): Promise<string> {
    // Both the Supabase SDK and global fetch trigger a ByteString
    // serialisation error on binary PDF data in Vercel's Node.js runtime.
    // Use Node.js native https module which handles binary buffers correctly.
    const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const parsed = new URL(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`);

    const transport = parsed.protocol === "http:" ? http : https;

    await new Promise<void>((resolve, reject) => {
      const req = transport.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || undefined,
          path: parsed.pathname,
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": mimeType,
            "Content-Length": file.length,
            "x-upsert": "true",
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              const body = Buffer.concat(chunks).toString("utf-8");
              reject(
                new Error(
                  `Storage upload failed for path "${path}": ${res.statusCode} ${body}`
                )
              );
            }
          });
        }
      );

      req.on("error", (err) => {
        reject(new Error(`Storage upload failed for path "${path}": ${err.message}`));
      });

      req.write(file);
      req.end();
    });

    return this.getSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  }

  /**
   * Download a file from Supabase Storage as a Buffer.
   *
   * @param path  Storage object path relative to the bucket root
   * @returns     Raw file bytes
   */
  async download(path: string): Promise<Buffer> {
    const { data, error } = await client()
      .storage
      .from(BUCKET)
      .download(path);

    if (error || !data) {
      throw new Error(
        `Storage download failed for path "${path}": ${error?.message ?? "no data returned"}`
      );
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Delete a file from Supabase Storage.
   *
   * @param path  Storage object path relative to the bucket root
   */
  async delete(path: string): Promise<void> {
    const { error } = await client()
      .storage
      .from(BUCKET)
      .remove([path]);

    if (error) {
      throw new Error(
        `Storage delete failed for path "${path}": ${error.message}`
      );
    }
  }

  /**
   * Generate a signed URL for a stored object.
   *
   * @param path              Storage object path relative to the bucket root
   * @param expiresInSeconds  TTL for the signed URL; defaults to 1 hour
   * @returns                 Signed URL string
   */
  async getSignedUrl(
    path: string,
    expiresInSeconds: number = SIGNED_URL_EXPIRY_SECONDS
  ): Promise<string> {
    const { data, error } = await client()
      .storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new Error(
        `Failed to create signed URL for path "${path}": ${error?.message ?? "no URL returned"}`
      );
    }

    return data.signedUrl;
  }
}
