import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { UserAvatar } from "~/components/ui/user-avatar";

const SIZE = 256;
/** Більше за це браузер на телефоні декодує повільно, а після обрізання все одно лишається 256×256. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

/** Центральний квадрат фото, зменшений до SIZE. EXIF-поворот createImageBitmap враховує сам. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  // JPEG не має прозорості: прозорий PNG інакше стане чорним.
  ctx.fillStyle = "#111113";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), "image/jpeg", 0.88),
  );
}

/** Фото профілю. Зберігається одразу після вибору, окремо від форми з імʼям і нікнеймом. */
export function AvatarPicker({ name, src }: { name: string; src?: string }) {
  const fetcher = useFetcher<{ avatar?: { error?: string } }>();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = fetcher.state !== "idle";
  const uploadError = busy ? undefined : fetcher.data?.avatar?.error;
  const error = localError ?? uploadError ?? null;

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setLocalError(null);
    if (!file.type.startsWith("image/")) return setLocalError("Оберіть зображення: JPEG, PNG або WebP.");
    if (file.size > MAX_SOURCE_BYTES) return setLocalError("Файл завеликий. Підійде фото до 20 МБ.");
    try {
      const image = await toSquareJpeg(file);
      setPreview(URL.createObjectURL(image));
      const form = new FormData();
      form.set("intent", "avatar");
      form.set("avatar", image, "avatar.jpg");
      fetcher.submit(form, { method: "post", action: "/settings", encType: "multipart/form-data" });
    } catch {
      setLocalError("Не вдалося прочитати зображення. Спробуйте інше фото.");
    }
  };

  const remove = () => {
    setPreview(null);
    setLocalError(null);
    fetcher.submit({ intent: "avatar-delete" }, { method: "post", action: "/settings" });
  };

  const shown = (uploadError ? null : preview) ?? src;
  return (
    <div className="flex items-center gap-5">
      <UserAvatar name={name || "?"} src={shown} className={`size-20 text-3xl transition-opacity duration-200 ${busy ? "opacity-60" : ""}`} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Зберігаю…" : shown ? "Змінити фото" : "Завантажити фото"}
          </Button>
          {shown && !busy && (
            <Button type="button" size="sm" variant="ghost" onClick={remove}>
              Прибрати
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>
        ) : (
          <p className="mt-2 text-xs text-[var(--color-text-faint)]">
            Видно на ваших ідеях, в обговореннях і в команді. У шапці сайту лишається звичайна іконка.
          </p>
        )}
      </div>
    </div>
  );
}
