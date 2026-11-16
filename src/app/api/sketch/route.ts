import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { isUuid } from "../../../core/album";
import { isSketchBg, isSketchToken, isValidSketchStroke } from "../../../core/sketch";
import { supabaseConfig } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

function corsHeaders(req: NextRequest): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  const allowed =
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:") ||
    origin.startsWith("https://")
      ? origin
      : "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function bearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+([0-9a-f]{64})$/i.exec(auth.trim());
  if (!m) return null;
  const tok = m[1].toLowerCase();
  return isSketchToken(tok) ? tok : null;
}

function bridgeClient() {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  return createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapRpcError(message: string | undefined): number {
  const text = message ?? "";
  if (text.includes("Bridge token unavailable")) return 401;
  if (text.includes("Too many strokes")) return 429;
  if (text.includes("Invalid")) return 400;
  return 500;
}

export function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const headers = corsHeaders(req);
  const token = bearerToken(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const supabase = bridgeClient();
  if (!supabase) return Response.json({ error: "config" }, { status: 503, headers });

  const sinceSeqRaw = Number(req.nextUrl.searchParams.get("sinceSeq") ?? "0");
  const sinceRevRaw = req.nextUrl.searchParams.get("sinceRev");
  const sinceSeq = Number.isFinite(sinceSeqRaw) && sinceSeqRaw > 0 ? Math.floor(sinceSeqRaw) : 0;
  const sinceRev = sinceRevRaw !== null && Number.isFinite(Number(sinceRevRaw)) ? Math.floor(Number(sinceRevRaw)) : null;

  const { data, error } = await supabase.rpc("sketch_bridge_state", {
    raw_token: token,
    since_seq: sinceSeq,
    since_rev: sinceRev,
  });
  if (error) {
    return Response.json({ error: "rpc_error" }, { status: mapRpcError(error.message), headers });
  }
  return Response.json(data, { status: 200, headers });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  const token = bearerToken(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const supabase = bridgeClient();
  if (!supabase) return Response.json({ error: "config" }, { status: 503, headers });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400, headers });
  }

  const action = body?.action;
  if (action === "stroke") {
    const strokeId = typeof body.strokeId === "string" ? body.strokeId : "";
    const segmentId = typeof body.segmentId === "string" ? body.segmentId : "";
    const kind = body.kind;
    const color = typeof body.color === "string" ? body.color : "#2a1f26";
    const width = body.width;
    const points = body.points;
    const stamp = body.stamp ?? null;
    if (!isUuid(strokeId) || !isUuid(segmentId) || !isValidSketchStroke(kind, points, color, width, stamp)) {
      return Response.json({ error: "invalid_stroke" }, { status: 400, headers });
    }
    const { data, error } = await supabase.rpc("sketch_bridge_stroke", {
      raw_token: token,
      stroke_id: strokeId,
      segment_id: segmentId,
      kind,
      pen_color: color,
      pen_width: width,
      pts: points,
      stamp_txt: typeof stamp === "string" ? stamp : null,
    });
    if (error) return Response.json({ error: "rpc_error" }, { status: mapRpcError(error.message), headers });
    return Response.json(data, { status: 200, headers });
  }

  if (action === "undo") {
    const { data, error } = await supabase.rpc("sketch_bridge_undo", { raw_token: token });
    if (error) return Response.json({ error: "rpc_error" }, { status: mapRpcError(error.message), headers });
    return Response.json(data, { status: 200, headers });
  }

  if (action === "clear") {
    const { data, error } = await supabase.rpc("sketch_bridge_clear", { raw_token: token });
    if (error) return Response.json({ error: "rpc_error" }, { status: mapRpcError(error.message), headers });
    return Response.json(data, { status: 200, headers });
  }

  if (action === "bg") {
    if (!isSketchBg(body.bg)) return Response.json({ error: "invalid_bg" }, { status: 400, headers });
    const { data, error } = await supabase.rpc("sketch_bridge_bg", { raw_token: token, next_bg: body.bg });
    if (error) return Response.json({ error: "rpc_error" }, { status: mapRpcError(error.message), headers });
    return Response.json(data, { status: 200, headers });
  }

  return Response.json({ error: "unknown_action" }, { status: 400, headers });
}
