"use client";

import { useState, useTransition } from "react";
import { Card, Button, TextInput, Select } from "@/components/ui";
import {
  createImage2VideoBatchAction,
  type ComposerImage,
  type ComposerSettings,
} from "./actions";

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function BatchComposer({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<"5" | "10">("5");
  const [mode, setMode] = useState<"std" | "pro">("std");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit() {
    setError(null);
    if (files.length === 0) {
      setError("Chọn ít nhất 1 ảnh");
      return;
    }
    startTransition(async () => {
      try {
        const images: ComposerImage[] = await Promise.all(
          files.map(async (f) => ({ name: f.name, dataBase64: await readAsBase64(f) })),
        );
        const settings: ComposerSettings = { prompt, duration, mode };
        await createImage2VideoBatchAction(workspaceId, projectId, settings, images);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gửi batch thất bại");
      }
    });
  }

  return (
    <Card className="mt-8">
      <div className="grid gap-3">
        <div>
          <label className="mb-1 block text-sm text-muted">Ảnh (chọn nhiều)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-xl file:border-0 file:bg-accent file:px-3 file:py-2 file:text-white"
          />
          {files.length > 0 && (
            <p className="mt-1 text-sm text-muted">{files.length} ảnh → {files.length} job</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm text-muted">Prompt (dùng chung cho cả batch)</label>
          <TextInput value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="vd: camera quay chậm, điện ảnh" className="w-full" />
        </div>

        <div className="flex gap-3">
          <div>
            <label className="mb-1 block text-sm text-muted">Thời lượng</label>
            <Select value={duration} onChange={(e) => setDuration(e.target.value as "5" | "10")}>
              <option value="5">5s</option>
              <option value="10">10s</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">Chế độ</label>
            <Select value={mode} onChange={(e) => setMode(e.target.value as "std" | "pro")}>
              <option value="std">std</option>
              <option value="pro">pro</option>
            </Select>
          </div>
        </div>

        {error && <p className="text-sm text-bad">{error}</p>}

        <div>
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending ? "Đang gửi…" : `Tạo ${files.length || ""} job`}
          </Button>
        </div>
      </div>
    </Card>
  );
}
