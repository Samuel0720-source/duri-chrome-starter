import { type NextRequest } from "next/server";
import { isUuid } from "../../../../core/album";
import { serverClient } from "../../../../lib/supabase/server";

// Serves one album photo to a member of its room, at a stable address the browser can cache.
// (A signed Storage URL changes on every page load, so the background would re-download each time.)
// ?size=t gives the thumbnail. Row level security on room_photos and Storage decides who gets bytes.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response(null, { status: 404 });
  const supabase = await serverClient();
  if (!supabase) return new Response(null, { status: 503 });
  const { data: photo } = await supabase.from("room_photos").select("room_id").eq("id", id).maybeSingle();
  if (!photo) return new Response(null, { status: 404 });
  const thumb = request.nextUrl.searchParams.get("size") === "t";
  const { data: file, error } = await supabase.storage
    .from("room-photos")
    .download(photo.room_id + "/" + id + (thumb ? "_t" : "") + ".jpg");
  if (error || !file) return new Response(null, { status: 404 });
  return new Response(file, {
    headers: {
      "Content-Type": "image/jpeg",
      // A photo id never gets new bytes. "private" keeps shared caches (CDNs) from storing it.
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
