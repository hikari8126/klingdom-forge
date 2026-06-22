import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const exec = promisify(execFile);

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

/** Trim a video file to [startSec, endSec] using stream copy (fast, lossless). */
export async function trimVideo(inputPath: string, startSec: number, endSec: number): Promise<Buffer> {
  const outPath = path.join(tmpdir(), `${randomUUID()}.mp4`);
  try {
    await exec(FFMPEG, [
      "-i", inputPath,
      "-ss", String(startSec),
      "-to", String(endSec),
      "-c", "copy",
      "-movflags", "+faststart",
      "-y",
      outPath,
    ]);
    return await readFile(outPath);
  } finally {
    await unlink(outPath).catch(() => {});
  }
}
