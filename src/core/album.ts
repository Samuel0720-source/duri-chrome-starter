// Pure helpers for the photo album. The browser resizes every picture before upload.

export const BIG = 1600; // longest side of the photo people look at
export const THUMB = 480; // longest side of the grid thumbnail
export const MAX_PHOTOS = 200; // the database refuses the 201st

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value);

// Shrinks (never enlarges) so the longest side is at most `max`, keeping the shape.
export function fitSize(width: number, height: number, max: number): { width: number; height: number } {
  if (!(width > 0 && height > 0)) throw new Error("Invalid size");
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Storage object name. The database and Storage policies accept exactly this shape.
export const photoFile = (room: string, id: string, thumb = false) => room + "/" + id + (thumb ? "_t" : "") + ".jpg";

// Address of our own photo route (stable, so the browser caches it).
export const photoUrl = (id: string, thumb = false) => "/api/photo/" + id + (thumb ? "?size=t" : "");

// Error messages from the album functions become dictionary keys.
export function albumErrorKey(message: string | undefined) {
  if (message?.includes("Album full")) return "album.err.full" as const;
  if (message?.includes("Photo unavailable")) return "album.err.gone" as const;
  return "album.err.upload" as const;
}
