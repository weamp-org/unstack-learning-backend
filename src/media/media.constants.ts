export const MAX_MEDIA_PER_REQUEST = 5;
export const MAX_IMAGES_PER_REQUEST = 5;
export const MAX_AUDIO_PER_REQUEST = 2;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export const MIN_AUDIO_SECONDS = 1;
export const MAX_AUDIO_SECONDS = 180;

/// Long enough for a slow phone upload, short enough that a leaked URL is not
/// a standing invitation.
export const PRESIGN_PUT_TTL_SECONDS = 600;

/// Reads are re-signed on every request; audio gets a longer window because a
/// teacher may sit on a paused player.
export const PRESIGN_GET_TTL_SECONDS = 15 * 60;
export const PRESIGN_GET_TTL_SECONDS_AUDIO = 60 * 60;

/// Abandoned drafts (never attached to a request) are cleared on the next
/// upload; the bucket's `staging/` lifecycle rule is the backstop.
export const STAGED_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export const IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const AUDIO_CONTENT_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
]);

export const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
};

/// Strips codec parameters so `audio/webm;codecs=opus` compares cleanly.
export function normalizeContentType(value: string): string {
  return value.split(';')[0].trim().toLowerCase();
}

export function isAllowedContentType(
  kind: 'IMAGE' | 'AUDIO',
  contentType: string,
): boolean {
  const normalized = normalizeContentType(contentType);
  return kind === 'IMAGE'
    ? IMAGE_CONTENT_TYPES.has(normalized)
    : AUDIO_CONTENT_TYPES.has(normalized);
}

export function extensionFor(contentType: string): string {
  return CONTENT_TYPE_EXTENSIONS[normalizeContentType(contentType)] ?? '.bin';
}
