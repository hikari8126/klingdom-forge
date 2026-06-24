"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ConfirmOpts = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};
type NotifyOpts = { title?: string; message: string };
type PromptOpts = {
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
};

type DialogState =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "notify"; opts: NotifyOpts; resolve: () => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void }
  | null;

type DialogApi = {
  /** In-site replacement for window.confirm — resolves true on OK, false on cancel/dismiss. */
  confirm: (opts: ConfirmOpts | string) => Promise<boolean>;
  /** In-site replacement for window.alert — resolves when dismissed. */
  notify: (opts: NotifyOpts | string) => Promise<void>;
  /** In-site replacement for window.prompt — resolves with the entered string, or null on cancel. */
  prompt: (opts: PromptOpts | string) => Promise<string | null>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within a DialogProvider");
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");

  const confirm = useCallback((opts: ConfirmOpts | string) => {
    const o = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => setState({ kind: "confirm", opts: o, resolve }));
  }, []);

  const notify = useCallback((opts: NotifyOpts | string) => {
    const o = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<void>((resolve) => setState({ kind: "notify", opts: o, resolve }));
  }, []);

  const prompt = useCallback((opts: PromptOpts | string) => {
    const o = typeof opts === "string" ? { title: opts } : opts;
    setInputValue(o.defaultValue ?? "");
    return new Promise<string | null>((resolve) => setState({ kind: "prompt", opts: o, resolve }));
  }, []);

  // Auto-focus input when prompt opens
  useEffect(() => {
    if (state?.kind === "prompt") {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [state]);

  const close = useCallback((result: boolean) => {
    setState((s) => {
      if (!s) return null;
      if (s.kind === "confirm") s.resolve(result);
      else if (s.kind === "notify") s.resolve();
      else if (s.kind === "prompt") s.resolve(result ? inputValue.trim() || null : null);
      return null;
    });
  }, [inputValue]);

  const submitPrompt = useCallback(() => {
    setState((s) => {
      if (s?.kind === "prompt") s.resolve(inputValue.trim() || null);
      return null;
    });
  }, [inputValue]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
      else if (e.key === "Enter" && state.kind !== "prompt") { e.preventDefault(); close(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  const isConfirm = state?.kind === "confirm";
  const isPrompt = state?.kind === "prompt";
  const confirmOpts = isConfirm ? (state!.opts as ConfirmOpts) : null;
  const promptOpts = isPrompt ? (state!.opts as PromptOpts) : null;

  return (
    <DialogContext.Provider value={{ confirm, notify, prompt }}>
      {children}
      {state && (
        <div
          onClick={() => close(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="w-[420px] max-w-[92vw] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
          >
            <div className="px-5 pb-2 pt-5">
              <h3 className="font-heading font-semibold text-white">
                {state.opts.title ?? (isConfirm ? "Xác nhận" : isPrompt ? "Nhập" : "Thông báo")}
              </h3>
            </div>
            {(state.opts.message || isPrompt) && (
              <div className="px-5 text-sm text-muted">
                {state.opts.message && <p className={isPrompt ? "mb-3" : "pb-5"}>{state.opts.message}</p>}
                {isPrompt && (
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitPrompt(); } }}
                    placeholder={promptOpts?.placeholder}
                    className="mb-5 w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-white outline-none focus:border-accent"
                  />
                )}
              </div>
            )}
            {!isPrompt && !state.opts.message && <div className="pb-3" />}
            <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4">
              {(isConfirm || isPrompt) && (
                <button
                  onClick={() => close(false)}
                  className="rounded-xl border border-border px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-white"
                >
                  {confirmOpts?.cancelLabel ?? "Huỷ"}
                </button>
              )}
              <button
                autoFocus={!isPrompt}
                onClick={() => isPrompt ? submitPrompt() : close(true)}
                className={
                  isConfirm && confirmOpts?.danger
                    ? "rounded-xl bg-bad px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                    : "rounded-xl bg-gradient-to-b from-accent-soft to-accent px-5 py-2 text-sm font-semibold text-[#04212c] transition hover:brightness-110"
                }
              >
                {isConfirm ? confirmOpts?.confirmLabel ?? "Đồng ý" : isPrompt ? promptOpts?.confirmLabel ?? "OK" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
