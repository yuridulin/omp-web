/**
 * Composer-side image preflight. The server owns the final validation; these
 * limits mirror `lib/image-attachments.ts` so a paste the agent routes would
 * reject fails before the draft is cleared. The UI may not import `lib/`.
 */

import { makeComposerImage, type ComposerImage } from "@/state/composer-store";

export const MAX_ATTACHED_IMAGES = 10;
export const MAX_ATTACHED_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_ATTACHED_IMAGE_BYTES = 5 * 1024 * 1024;

export interface PromptImage {
  type: "image";
  data: string;
  mimeType: string;
}

function megabytes(bytes: number): number {
  return bytes / (1024 * 1024);
}

/** The wire shape `POST /api/agent/sessions/{id}/intent` forwards to omp. */
export function toPromptImages(images: readonly ComposerImage[]): PromptImage[] {
  return images.map((image) => ({ type: "image", data: image.data, mimeType: image.mimeType }));
}

/** Image files carried by a clipboard paste, in clipboard order. */
export function clipboardImageFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];
  const files: File[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  if (files.length > 0) return files;
  return Array.from(dataTransfer.files ?? []).filter((file) => file.type.startsWith("image/"));
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export interface PreparedImages {
  images: ComposerImage[];
  error: string | null;
}

/** Validate a paste against the current draft, then read it as base64. */
export async function preparePastedImages(
  files: readonly File[],
  existing: readonly ComposerImage[],
): Promise<PreparedImages> {
  if (files.length === 0) return { images: [], error: null };
  if (existing.length + files.length > MAX_ATTACHED_IMAGES) {
    return { images: [], error: `A message can include at most ${MAX_ATTACHED_IMAGES} images` };
  }

  let totalBytes = existing.reduce((sum, image) => sum + image.size, 0);
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return { images: [], error: "Only image files can be attached" };
    }
    if (file.size === 0) return { images: [], error: "The pasted image is empty" };
    if (file.size > MAX_ATTACHED_IMAGE_BYTES) {
      return {
        images: [],
        error: `Each image must be ${megabytes(MAX_ATTACHED_IMAGE_BYTES)}MB or smaller`,
      };
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_ATTACHED_IMAGE_BYTES) {
    return {
      images: [],
      error: `Attached images must total ${megabytes(MAX_TOTAL_ATTACHED_IMAGE_BYTES)}MB or less`,
    };
  }

  try {
    const images = await Promise.all(
      files.map(async (file) =>
        makeComposerImage(await fileToBase64(file), file.type, file.size),
      ),
    );
    return { images, error: null };
  } catch {
    return { images: [], error: "Could not read the pasted image" };
  }
}
