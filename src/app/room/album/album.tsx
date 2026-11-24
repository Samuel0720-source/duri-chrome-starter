"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BIG, THUMB, albumErrorKey, fitSize, photoFile, photoUrl } from "../../../core/album";
import { useT } from "../../../i18n/client";
import type { MessageKey } from "../../../i18n/dict";
import { browserClient } from "../../../lib/supabase/browser";
import { deletePhoto, setWallpaper } from "../actions";

export type Photo = { id: string; width: number; height: number; mine: boolean; date: string };

// Draws the picture again at a smaller size. A fresh JPEG keeps no camera data (GPS, device).
async function encode(bitmap: ImageBitmap, max: number) {
  const size = fitSize(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", max === BIG ? 0.85 : 0.8));
  if (!blob) throw new Error("encode");
  return { blob, ...size };
}

export function Album({ roomId, photos, wallpaper, partner }: { roomId: string; photos: Photo[]; wallpaper: string | null; partner: string }) {
  const { t } = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<Photo | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const [sure, setSure] = useState(false);

  async function upload(files: FileList) {
    const supabase = browserClient();
    if (!supabase || files.length === 0) return;
    setProblem(null);
    const list = [...files];
    setProgress({ done: 0, total: list.length });
    for (const [i, file] of list.entries()) {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        setProblem("album.err.format");
        continue;
      }
      try {
        const big = await encode(bitmap, BIG);
        const small = await encode(bitmap, THUMB);
        const id = crypto.randomUUID();
        const bucket = supabase.storage.from("room-photos");
        const up1 = await bucket.upload(photoFile(roomId, id), big.blob, { contentType: "image/jpeg", upsert: false });
        const up2 = up1.error ? up1 : await bucket.upload(photoFile(roomId, id, true), small.blob, { contentType: "image/jpeg", upsert: false });
        if (up2.error) {
          if (!up1.error) await bucket.remove([photoFile(roomId, id)]); // thumbnail failed: drop the orphaned original
          throw up2.error;
        }
        const { error } = await supabase.rpc("add_room_photo", { target: roomId, photo: id, w: big.width, h: big.height });
        if (error) {
          // Not in the album, so do not leave the files behind.
          await bucket.remove([photoFile(roomId, id), photoFile(roomId, id, true)]);
          setProblem(albumErrorKey(error.message));
          if (error.message.includes("Album full")) break;
        }
      } catch {
        setProblem("album.err.upload");
      } finally {
        bitmap.close();
        setProgress({ done: i + 1, total: list.length });
      }
    }
    setProgress(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  const show = (photo: Photo) => {
    setOpen(photo);
    setSure(false);
    dialog.current?.showModal();
  };

  const openIdx = open ? photos.findIndex((p) => p.id === open.id) : -1;
  const stepPhoto = useCallback((delta: -1 | 1) => {
    if (openIdx < 0) return;
    const next = photos[openIdx + delta];
    if (next) {
      setOpen(next);
      setSure(false);
    }
  }, [openIdx, photos]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); stepPhoto(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); stepPhoto(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, stepPhoto]);

  return (
    <div className="album">
      <div className="album-tools">
        <label className="button album-add">
          {t("album.add")}
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            className="visually-hidden"
            disabled={progress !== null}
            onChange={(e) => e.currentTarget.files && upload(e.currentTarget.files)}
            data-testid="album-input"
          />
        </label>
        {wallpaper && (
          <form action={setWallpaper}>
            <input type="hidden" name="room" value={roomId} />
            <button type="submit" className="secondary">{t("album.clearWallpaper")}</button>
          </form>
        )}
      </div>
      <p className="hint">{t("album.hint", { max: "200" })}</p>
      {progress && <p role="status">{t("album.uploading", { done: String(progress.done), total: String(progress.total) })}</p>}
      {problem && <p role="alert" className="error">{t(problem)}</p>}

      {photos.length === 0 ? (
        <p className="album-empty">{t("album.empty")}</p>
      ) : (
        <ul className="album-grid">
          {photos.map((p) => (
            <li key={p.id} data-wallpaper={p.id === wallpaper ? "true" : undefined}>
              <button type="button" className="album-tile" onClick={() => show(p)} aria-label={t("album.open") + " · " + p.date}>
                <img src={photoUrl(p.id, true)} alt="" width={p.width} height={p.height} loading="lazy" decoding="async" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog ref={dialog} className="album-view" onClose={() => setOpen(null)} aria-label={t("album.open")}>
        {open && (
          <>
            <img src={photoUrl(open.id)} alt={t("album.alt", { date: open.date })} width={open.width} height={open.height} />
            <div className="album-meta-row">
              <p className="hint">
                {open.mine ? t("album.byMe") : t("album.byPartner", { name: partner })} · {open.date}
              </p>
              {photos.length > 1 && (
                <div className="album-nav">
                  <button type="button" className="secondary" disabled={openIdx <= 0} onClick={() => stepPhoto(-1)} aria-label={t("album.prev")}>
                    ←
                  </button>
                  <span className="hint">{openIdx + 1} / {photos.length}</span>
                  <button type="button" className="secondary" disabled={openIdx >= photos.length - 1} onClick={() => stepPhoto(1)} aria-label={t("album.next")}>
                    →
                  </button>
                </div>
              )}
            </div>
            <div className="album-actions">
              {open.id === wallpaper ? (
                <span className="hint" data-testid="album-is-wallpaper">{t("album.isWallpaper")}</span>
              ) : (
                <form action={setWallpaper} onSubmit={() => dialog.current?.close()}>
                  <input type="hidden" name="room" value={roomId} />
                  <input type="hidden" name="photo" value={open.id} />
                  <button type="submit">{t("album.setWallpaper")}</button>
                </form>
              )}
              {open.mine && !sure && (
                <button type="button" className="danger" onClick={() => setSure(true)}>{t("album.delete")}</button>
              )}
              <button type="button" className="secondary" onClick={() => dialog.current?.close()}>{t("album.close")}</button>
            </div>
            {open.mine && sure && (
              <form action={deletePhoto} className="album-confirm" onSubmit={() => dialog.current?.close()}>
                <input type="hidden" name="photo" value={open.id} />
                <p>{t("album.deleteConfirm")}</p>
                <button type="submit" className="danger">{t("album.deleteYes")}</button>
              </form>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
