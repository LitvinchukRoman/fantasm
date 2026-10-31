import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouteLoaderData } from "react-router";
import { IconArrowRight, IconCheck, IconClose, IconPlus, IconUser } from "~/components/landing/icons";
import { Button } from "~/components/ui/button";
import { track } from "~/lib/analytics";
import { ACCEPT_ATTRIBUTE, checkFiles, formatSize, isImage, MAX_FILES, namePasted, safePreviewUrl } from "~/lib/support/attachments";
import { errorText, getTransport } from "~/lib/support/client";
import { DISCLOSURE, isInternalPath, MAX_MESSAGE, promptsFor, STATUS_NOTE, wasRedacted } from "~/lib/support/copy";
import { chatReducer, initialChat, type ChatState } from "~/lib/support/reducer";
import { readTicketId, saveTicketId } from "~/lib/support/session";
import type { Attachment, SupportMessage, SupportTransport, TraceStep } from "~/lib/support/types";
import type { RootData } from "~/root";
import { IconChat, IconCollapse, IconExpand, IconFile, IconPaperclip } from "./icons";

export interface SupportContext {
  /** Сторінка, з якої людина відкрила чат. */
  page: string;
  /** Ідея, про яку питають (сторінка ідеї або `?idea=` на /help). */
  ideaSlug?: string;
  /** Тема з посилання (`?topic=login`): її приклад іде першим. */
  topic?: string;
  /** Звернення, яке відкрили зі сповіщення (`?ticket=`). */
  ticketId?: string;
}

/** Найвищий рядок поля вводу, далі воно прокручується. */
const FIELD_MAX_PX = 168;

/** Файл, доданий до чернетки: вантажиться одразу, щоб надсилання було миттєвим. */
interface Draft {
  key: string;
  file: File;
  preview?: string;
  status: "uploading" | "ready" | "failed";
  attachment?: Attachment;
  controller: AbortController;
}

let draftCounter = 0;

/**
 * Чат підтримки у форматі бічного помічника: шапка, розмова, поле вводу внизу.
 * Той самий компонент у плаваючій панелі (з `onClose`) і на /help. Стан тримає чистий reducer
 * (знімок + події SSE), транспорт підставляє getTransport(). Тексти бота лише як текст.
 * Верстка залежить від ширини самого чату (container queries), а не екрана: розтягнута панель
 * дає ширшу колонку, більший текст і приклади в ряд.
 */
export function SupportChat({
  context,
  autoFocus = false,
  onClose,
  wide,
  onToggleWide,
}: {
  context: SupportContext;
  autoFocus?: boolean;
  onClose?: () => void;
  wide?: boolean;
  onToggleWide?: () => void;
}) {
  const root = useRouteLoaderData<RootData>("root");
  const anonymous = !root?.currentUser;
  const [state, dispatch] = useReducer(chatReducer, initialChat);
  const [transport, setTransport] = useState<SupportTransport | null>(null);
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [askEmail, setAskEmail] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void getTransport().then((value) => alive && setTransport(value));
    return () => {
      alive = false;
    };
  }, []);

  // Відновлюємо звернення після переходу між сторінками або зі сповіщення.
  useEffect(() => {
    if (!transport) return;
    const ticketId = context.ticketId ?? readTicketId();
    if (!ticketId) return;
    let alive = true;
    transport.getTicket(ticketId).then(
      (snapshot) => alive && dispatch({ kind: "snapshot", snapshot }),
      () => saveTicketId(null),
    );
    return () => {
      alive = false;
    };
  }, [transport, context.ticketId]);

  useEffect(() => {
    if (!transport || !state.ticketId) return;
    saveTicketId(state.ticketId);
    return transport.subscribe(state.ticketId, {
      onEvent: (event) => dispatch({ kind: "event", event }),
      onSnapshot: (snapshot) => dispatch({ kind: "snapshot", snapshot }),
    });
  }, [transport, state.ticketId]);

  // Нова репліка або крок: тримаємо розмову прокрученою донизу.
  useEffect(() => {
    const node = log.current;
    if (node && state.status !== "idle") node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [state.messages.length, state.trace.length, state.status]);

  // Поле росте разом із текстом до FIELD_MAX_PX.
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, FIELD_MAX_PX)}px`;
  }, [text]);

  function addFiles(files: File[]) {
    if (!transport || files.length === 0) return;
    const { accepted, rejected } = checkFiles(files, drafts.length);
    setError(rejected[0] ?? null);
    const fresh: Draft[] = accepted.map((file) => ({
      key: `d${++draftCounter}`,
      file,
      preview: isImage(file.type) ? URL.createObjectURL(file) : undefined,
      status: "uploading",
      controller: new AbortController(),
    }));
    setDrafts((current) => [...current, ...fresh]);
    for (const draft of fresh) {
      transport.upload(draft.file, draft.controller.signal).then(
        (attachment) =>
          setDrafts((current) => current.map((item) => (item.key === draft.key ? { ...item, status: "ready", attachment } : item))),
        () => {
          if (draft.controller.signal.aborted) return;
          setDrafts((current) => current.map((item) => (item.key === draft.key ? { ...item, status: "failed" } : item)));
        },
      );
    }
    if (accepted.length) track("ui.click", { target: "support.attach" });
  }

  function removeDraft(key: string) {
    setDrafts((current) => {
      const draft = current.find((item) => item.key === key);
      if (draft) {
        draft.controller.abort();
        if (draft.preview) URL.revokeObjectURL(draft.preview);
      }
      return current.filter((item) => item.key !== key);
    });
    field.current?.focus();
  }

  const ready = drafts.filter((draft) => draft.status === "ready" && draft.attachment);
  const uploading = drafts.some((draft) => draft.status === "uploading");
  const canSend = Boolean(transport) && !sending && !uploading && (text.trim().length > 0 || ready.length > 0);

  async function send(body: string) {
    const message = body.trim();
    const attachments = ready.flatMap((draft) =>
      draft.attachment ? [{ ...draft.attachment, url: draft.attachment.url ?? draft.preview }] : [],
    );
    if ((!message && attachments.length === 0) || sending || uploading || !transport) return;
    setSending(true);
    setError(null);
    try {
      const result = await transport.send({
        ticketId: state.ticketId,
        text: message,
        page: context.page,
        ...(attachments.length ? { attachmentIds: attachments.map((attachment) => attachment.id) } : {}),
        ...(context.ideaSlug ? { ideaSlug: context.ideaSlug } : {}),
        ...(anonymous && email.trim() ? { email: email.trim() } : {}),
      });
      dispatch({
        kind: "sent",
        ticketId: result.ticketId,
        message: {
          id: result.messageId,
          author: "customer",
          visibility: "public",
          text: message,
          createdAt: new Date().toISOString(),
          ...(attachments.length ? { attachments } : {}),
        },
      });
      setText("");
      // Превʼю лишаються жити в надісланому повідомленні, тож URL не відкликаємо.
      setDrafts((current) => current.filter((draft) => draft.status !== "ready"));
      setAskEmail(false);
      track("ui.click", { target: "support.send" });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSending(false);
      field.current?.focus();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) void send(text);
    }
  }

  // Скріншот із буфера (Ctrl+V / ⌘V) додається як файл, текст вставляється як звичайно.
  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...event.clipboardData.files];
    if (files.length === 0) return;
    event.preventDefault();
    addFiles(files.map((file, index) => namePasted(file, drafts.length + index)));
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragOver(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDragOver(false);
    addFiles([...event.dataTransfer.files]);
  }

  function startOver() {
    saveTicketId(null);
    dispatch({ kind: "reset" });
    for (const draft of drafts) removeDraft(draft.key);
    setError(null);
    field.current?.focus();
  }

  const messages = state.messages.filter((message) => message.visibility === "public");
  const lastBot = messages.findLast((message) => message.author === "bot");
  const fresh = state.status === "idle";
  const canRate = state.status === "awaiting_customer" || state.status === "solved";

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`@container support-glow relative flex min-h-0 flex-1 flex-col ${dragOver ? "support-drop" : ""}`}
    >
      <header className="flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 sm:px-6 sm:pt-5">
        <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-accent)]">
          <IconChat className="size-[1.125rem]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="support-title" className="text-[0.9375rem] font-medium text-[var(--color-text)]">
            Підтримка Fantasm
          </h2>
          <p className="truncate text-xs text-[var(--color-text-faint)]">ШІ-асистент, людина на складних питаннях</p>
        </div>
        {!fresh && (
          <HeaderButton label="Нове питання" onClick={startOver}>
            <IconPlus className="size-4" />
          </HeaderButton>
        )}
        {onToggleWide && (
          <HeaderButton label={wide ? "Звузити чат" : "Розгорнути чат"} onClick={onToggleWide} className="max-sm:hidden">
            {wide ? <IconCollapse className="size-4" /> : <IconExpand className="size-4" />}
          </HeaderButton>
        )}
        {onClose && (
          <HeaderButton label="Закрити чат" onClick={onClose}>
            <IconClose className="size-4" />
          </HeaderButton>
        )}
      </header>

      <div ref={log} className="support-log flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col">
          {fresh ? (
            <Welcome topic={context.topic} disabled={!transport || sending} onPick={(prompt) => void send(prompt)} />
          ) : (
            <ol aria-live="polite" aria-relevant="additions" className="space-y-7 py-6 @3xl:space-y-9">
              {messages.map((message) => (
                <MessageItem key={message.id} message={message} transport={transport} feedback={canRate && message === lastBot} />
              ))}
              <Progress state={state} />
            </ol>
          )}
        </div>
      </div>

      <form onSubmit={onSubmit} className="px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        <div className="mx-auto w-full max-w-[46rem]">
          {error && (
            <p role="alert" className="mb-2 px-1 text-sm text-[var(--color-accent)]">
              {error}
            </p>
          )}
          <div className="support-composer rounded-[1.75rem] border bg-[var(--color-surface)] transition-[border-color] duration-200">
            {drafts.length > 0 && (
              <ul aria-label="Вкладення" className="flex flex-wrap gap-2 px-3 pt-3">
                {drafts.map((draft) => (
                  <DraftItem key={draft.key} draft={draft} onRemove={() => removeDraft(draft.key)} />
                ))}
              </ul>
            )}
            {/* Скріпка, поле й кнопка в одному ряду на одній осі; кнопки тримаються низу, коли поле росте. */}
            <div className="flex items-end gap-1 py-2 pr-2 pl-2">
              <input
                ref={picker}
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                tabIndex={-1}
                className="sr-only"
                aria-hidden="true"
                onChange={(event) => {
                  addFiles([...(event.target.files ?? [])]);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => picker.current?.click()}
                disabled={!transport || drafts.length >= MAX_FILES}
                aria-label="Додати файл або скріншот"
                title="Додати файл або скріншот"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors duration-200 hover:bg-[var(--color-surface-strong)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40"
              >
                <IconPaperclip className="size-5" />
              </button>
              <label htmlFor="support-text" className="sr-only">
                Опиши проблему
              </label>
              <textarea
                id="support-text"
                ref={field}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                maxLength={MAX_MESSAGE}
                rows={1}
                // У панелі фокус ставить сам <dialog>, на /help лише за явним проханням.
                autoFocus={autoFocus}
                placeholder={fresh ? "Опиши, що сталося" : "Напиши відповідь"}
                className="block min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-base leading-6 text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none"
              />
              <button
                type="submit"
                aria-label={sending ? "Надсилаю" : uploading ? "Файл ще завантажується" : "Надіслати"}
                disabled={!canSend}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-bg)] transition-[background-color,color,transform] duration-200 hover:bg-[var(--color-accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] active:scale-95 disabled:bg-[var(--color-surface-strong)] disabled:text-[var(--color-text-muted)]"
              >
                <IconArrowRight className="size-[1.125rem] -rotate-90" />
              </button>
            </div>
            {askEmail && (
              <>
                <label htmlFor="support-email" className="sr-only">
                  Email для відповіді
                </label>
                <input
                  id="support-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={254}
                  placeholder="you@example.com"
                  className="mx-5 mb-3 block w-[calc(100%-2.5rem)] border-b border-[var(--color-border-strong)] bg-transparent py-1.5 text-base text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-text-muted)] focus:outline-none sm:text-sm"
                />
              </>
            )}
            {anonymous && fresh && !askEmail && (
              <div className="px-5 pb-3">
                <button type="button" onClick={() => setAskEmail(true)} className="support-link text-xs">
                  Додати email для відповіді
                </button>
              </div>
            )}
            {text.length >= MAX_MESSAGE * 0.8 && (
              <p className="px-5 pb-3 text-xs tabular-nums text-[var(--color-text-muted)]">
                {text.length} / {MAX_MESSAGE}
              </p>
            )}
          </div>
          <p className="mt-2.5 px-2 text-center text-xs leading-5 text-[var(--color-text-muted)]">{DISCLOSURE}</p>
        </div>
      </form>

      {dragOver && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-bg-soft)]/80">
          <p className="flex items-center gap-2 text-[0.9375rem] text-[var(--color-text)]">
            <IconPaperclip className="size-5 text-[var(--color-accent)]" />
            Відпусти, щоб додати файл
          </p>
        </div>
      )}
    </div>
  );
}

function HeaderButton({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors duration-200 hover:bg-[var(--color-surface-strong)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** Порожній чат: привітання по центру, приклади внизу біля поля вводу; у широкій панелі приклади в ряд. */
function Welcome({ topic, disabled, onPick }: { topic?: string; disabled: boolean; onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <span aria-hidden="true" className="text-[var(--color-accent)]">
          <IconChat className="size-9 @3xl:size-11" />
        </span>
        <p className="mt-5 text-[1.625rem] leading-tight font-medium tracking-[-0.02em] text-[var(--color-text)] @3xl:text-[2.25rem]">
          З чого почнемо?
        </p>
        <p className="mt-3 max-w-[22rem] text-[0.9375rem] leading-6 text-[var(--color-text-muted)] @3xl:max-w-[30rem] @3xl:text-base @3xl:leading-7">
          Я перевірю твій акаунт та ідеї й поясню, що відбувається. Те, що вирішує людина, передам модератору з усім, що зʼясував.
          Можна додати скріншот.
        </p>
      </div>
      <ul className="flex flex-col items-end gap-2 pb-3 @3xl:flex-row @3xl:flex-wrap @3xl:justify-center">
        {promptsFor(topic).map((prompt) => (
          <li key={prompt.topic}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(prompt.text)}
              className="rounded-[1.25rem] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 py-2.5 text-left text-[0.9375rem] text-[var(--color-text)] transition-[background-color,border-color] duration-200 hover:border-[var(--color-text-faint)] hover:bg-[var(--color-surface-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50"
            >
              {prompt.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DraftItem({ draft, onRemove }: { draft: Draft; onRemove: () => void }) {
  const failed = draft.status === "failed";
  return (
    <li className="relative">
      {draft.preview ? (
        <img
          src={draft.preview}
          alt={draft.file.name}
          className={`size-16 rounded-xl border object-cover ${failed ? "border-[var(--color-accent)]" : "border-[var(--color-border-strong)]"} ${draft.status === "uploading" ? "opacity-50" : ""}`}
        />
      ) : (
        <span
          className={`flex h-16 max-w-[12rem] items-center gap-2 rounded-xl border px-3 ${failed ? "border-[var(--color-accent)]" : "border-[var(--color-border-strong)]"} ${draft.status === "uploading" ? "opacity-60" : ""}`}
        >
          <IconFile className="size-5 shrink-0 text-[var(--color-text-muted)]" />
          <span className="min-w-0">
            <span className="block truncate text-xs text-[var(--color-text)]">{draft.file.name}</span>
            <span className="block text-[0.6875rem] text-[var(--color-text-muted)]">{formatSize(draft.file.size)}</span>
          </span>
        </span>
      )}
      {draft.status === "uploading" && (
        <span role="status" className="absolute inset-0 flex items-center justify-center">
          <span className="support-pulse size-2 rounded-full bg-[var(--color-text)]" />
          <span className="sr-only">Завантажую {draft.file.name}</span>
        </span>
      )}
      {failed && <span className="sr-only">Не вдалося завантажити {draft.file.name}</span>}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Прибрати ${draft.file.name}`}
        title={failed ? "Не завантажилось. Прибрати" : "Прибрати"}
        className="absolute -top-1.5 -right-1.5 inline-flex size-5 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-strong)] text-[var(--color-text)] hover:bg-[var(--color-bg)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
      >
        <IconClose className="size-3" />
      </button>
    </li>
  );
}

/** Вкладення в повідомленні: картинки мініатюрами, решта плашками з іменем і розміром. */
function Attachments({ items, align }: { items: Attachment[]; align: "start" | "end" }) {
  return (
    <ul className={`mt-2 flex flex-wrap gap-2 ${align === "end" ? "justify-end" : ""}`}>
      {items.map((attachment) => {
        const url = safePreviewUrl(attachment);
        const content =
          url && isImage(attachment.contentType) ? (
            <img
              src={url}
              alt={attachment.name}
              loading="lazy"
              className="max-h-40 max-w-[14rem] rounded-xl border border-[var(--color-border-strong)] object-cover @3xl:max-h-56 @3xl:max-w-[20rem]"
            />
          ) : (
            <span className="flex items-center gap-2 rounded-xl border border-[var(--color-border-strong)] px-3 py-2">
              <IconFile className="size-5 shrink-0 text-[var(--color-text-muted)]" />
              <span className="min-w-0">
                <span className="block max-w-[12rem] truncate text-sm text-[var(--color-text)]">{attachment.name}</span>
                <span className="block text-xs text-[var(--color-text-muted)]">{formatSize(attachment.size)}</span>
              </span>
            </span>
          );
        return (
          <li key={attachment.id}>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">
                {content}
              </a>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MessageItem({ message, transport, feedback }: { message: SupportMessage; transport: SupportTransport | null; feedback: boolean }) {
  if (message.author === "customer") {
    return (
      <li data-author="customer" className="flex flex-col items-end">
        <span className="sr-only">Ти:</span>
        {message.text && (
          <p className="max-w-[85%] rounded-[1.25rem] rounded-br-md bg-[var(--color-surface-strong)] px-4 py-2.5 text-base leading-7 whitespace-pre-wrap text-[var(--color-text)] [overflow-wrap:anywhere] @3xl:max-w-[75%] @3xl:text-[1.0625rem]">
            {message.text}
          </p>
        )}
        {message.attachments?.length ? <Attachments items={message.attachments} align="end" /> : null}
        {wasRedacted(message.text) && <p className="mt-1.5 text-xs text-[var(--color-text-faint)]">Ми прибрали персональні дані з повідомлення.</p>}
      </li>
    );
  }

  const agent = message.author === "agent";
  const actions = message.actions?.filter((action) => isInternalPath(action.to)) ?? [];
  return (
    <li data-author={message.author} className="flex gap-3 @3xl:gap-4">
      <Avatar agent={agent} />
      <div className="min-w-0 flex-1 pt-1">
        <span className="hud-label">{agent ? "Команда Fantasm" : "Підтримка"}</span>
        <p className="mt-1.5 text-base leading-7 whitespace-pre-wrap text-[var(--color-text)] [overflow-wrap:anywhere] @3xl:text-[1.0625rem] @3xl:leading-8">
          {message.text}
        </p>
        {message.attachments?.length ? <Attachments items={message.attachments} align="start" /> : null}
        {actions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button key={action.to} to={action.to} variant="secondary" size="sm" arrow>
                {action.label}
              </Button>
            ))}
          </div>
        )}
        {feedback && <Feedback messageId={message.id} transport={transport} />}
      </div>
    </li>
  );
}

function Avatar({ agent = false, pulse = false }: { agent?: boolean; pulse?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full border ${
        agent ? "border-[var(--color-border-strong)] text-[var(--color-text)]" : "border-[var(--color-accent)]/30 text-[var(--color-accent)]"
      } ${pulse ? "support-pulse" : ""}`}
    >
      {agent ? <IconUser className="size-4" /> : <IconChat className="size-4" />}
    </span>
  );
}

function Feedback({ messageId, transport }: { messageId: string; transport: SupportTransport | null }) {
  const [given, setGiven] = useState<boolean | null>(null);
  if (given !== null) {
    return (
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
        <IconCheck className="size-3.5" /> Дякую за відгук
      </p>
    );
  }
  const rate = (helpful: boolean) => {
    setGiven(helpful);
    track("ui.click", { target: "support.feedback", helpful: String(helpful) });
    void transport?.feedback(messageId, helpful).catch(() => undefined);
  };
  return (
    <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-text-faint)]">
      <span>Відповідь допомогла?</span>
      <button type="button" onClick={() => rate(true)} className="support-link">
        Так
      </button>
      <button type="button" onClick={() => rate(false)} className="support-link">
        Ні
      </button>
    </div>
  );
}

/**
 * Що бот робить зараз: людські підписи кроків, без сирого trace (у ньому правила й дані для персоналу).
 * Пройдені кроки лишаються списком, щоб було видно, що бот перевірив, а не вгадав.
 * Коли бот закінчив, на місці кроків лишається підсумок: хто й де відповість далі.
 */
function Progress({ state }: { state: ChatState }) {
  const working = state.status === "processing" || state.stage !== null;
  const note = STATUS_NOTE[state.status as keyof typeof STATUS_NOTE];

  if (working) {
    const steps = visibleSteps(state.trace);
    const current = steps.at(-1)?.summary ?? "Отримав повідомлення";
    return (
      <li className="flex gap-3 @3xl:gap-4">
        <Avatar pulse />
        <div role="status" className="min-w-0 flex-1 space-y-1.5 pt-1.5">
          {steps.slice(0, -1).map((step) => (
            <p key={`${step.stage}-${step.at}`} className="flex items-center gap-2 text-sm text-[var(--color-text-faint)]">
              <IconCheck className="size-3.5 shrink-0" />
              {step.summary.replace(/…$/, "")}
            </p>
          ))}
          <p className="text-[0.9375rem] text-[var(--color-text-muted)]">{current.replace(/…$/, "")}…</p>
        </div>
      </li>
    );
  }
  if (!note) return null;
  return (
    <li className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm leading-6 text-[var(--color-text-muted)]">
      {note}
    </li>
  );
}

/** Кроки поточної обробки: від останнього «received» (кожна репліка починає нове коло). */
function visibleSteps(trace: TraceStep[]): TraceStep[] {
  const start = trace.findLastIndex((step) => step.stage === "received");
  return trace.slice(Math.max(start, 0)).filter((step) => step.stage !== "error" && step.summary);
}
