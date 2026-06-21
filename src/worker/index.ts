import "dotenv/config"; // load .env (DATABASE_URL, KLING_ENC_KEY, …) — Next does this for the app, but the standalone worker must do it itself
import { db } from "@/lib/db";
import { dispatchOnce } from "./dispatcher";
import { pollOnce } from "./poller";

const DISPATCH_INTERVAL = Number(process.env.WORKER_DISPATCH_MS ?? 2000);
const POLL_INTERVAL = Number(process.env.WORKER_POLL_MS ?? 5000);
const HEARTBEAT_INTERVAL = 5000;

let running = true;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function heartbeatLoop() {
  while (running) {
    try {
      await db.workerStatus.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", beatAt: new Date() },
        update: { beatAt: new Date() },
      });
    } catch (e) {
      console.error("[heartbeat] error:", e);
    }
    await sleep(HEARTBEAT_INTERVAL);
  }
}

async function dispatchLoop() {
  while (running) {
    try {
      let worked = true;
      while (worked) worked = await dispatchOnce();
    } catch (e) {
      console.error("[dispatch] error:", e);
    }
    await sleep(DISPATCH_INTERVAL);
  }
}

async function pollLoop() {
  while (running) {
    try {
      await pollOnce();
    } catch (e) {
      console.error("[poll] error:", e);
    }
    await sleep(POLL_INTERVAL);
  }
}

function shutdown() {
  running = false;
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[worker] KlingDom Forge worker started");
void Promise.all([dispatchLoop(), pollLoop(), heartbeatLoop()]);
