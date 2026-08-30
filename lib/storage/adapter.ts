/**
 * StorageAdapter — the single interface for all file storage operations.
 *
 * All code that needs to read or write files MUST import from this module.
 * Never call @supabase/supabase-js or any cloud storage SDK directly.
 *
 * Row-level security is enforced at the Supabase level, not here.
 * All signed URLs returned by this adapter expire after 1 hour.
 */
export interface StorageAdapter {
  /**
   * Upload a file and return a signed URL valid for 1 hour.
   *
   * @param path      Object path within the storage bucket (e.g. "userId/resume.pdf")
   * @param file      Raw file bytes as a Buffer
   * @param mimeType  MIME type (e.g. "application/pdf")
   * @returns         Signed URL granting temporary read access to the uploaded object
   */
  upload(path: string, file: Buffer, mimeType: string): Promise<string>;

  /**
   * Download a stored file and return its raw bytes.
   *
   * @param path  Object path within the storage bucket
   * @returns     File contents as a Buffer
   */
  download(path: string): Promise<Buffer>;

  /**
   * Permanently delete a stored file.
   *
   * @param path  Object path within the storage bucket
   */
  delete(path: string): Promise<void>;

  /**
   * Generate a signed URL for an existing stored object.
   *
   * @param path              Object path within the storage bucket
   * @param expiresInSeconds  TTL for the signed URL; defaults to 3600 (1 hour)
   * @returns                 Signed URL string
   */
  getSignedUrl(path: string, expiresInSeconds?: number): Promise<string>;
}

// ---------------------------------------------------------------------------
// Active adapter singleton
// ---------------------------------------------------------------------------

import { SupabaseStorageAdapter } from "./supabase";

/**
 * The active StorageAdapter instance.
 *
 * Import and use this singleton everywhere storage operations are needed:
 *
 *   import { storage } from "@/lib/storage/adapter";
 *   const url = await storage.upload(path, buffer, mimeType);
 */
export const storage: StorageAdapter = new SupabaseStorageAdapter();
