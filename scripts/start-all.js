/**
 * Unified process runner for single-container / Render Free Tier deployments.
 * Runs Next.js web server, BullMQ worker, and WebSocket server concurrently.
 */
const { spawn } = require("child_process");

function startProcess(name, command, args, extraEnv = {}) {
  const proc = spawn(command, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extraEnv },
  });

  proc.on("exit", (code, signal) => {
    console.log(`[${name}] Exited with code ${code} (signal: ${signal})`);
    if (code !== 0) {
      process.exit(code || 1);
    }
  });

  return proc;
}

console.log("==================================================");
console.log("  MONOTRANSFER // UNIFIED DEPLOYMENT RUNNER");
console.log("==================================================");

// 1. WebSocket Server (Port 3001)
const wsProc = startProcess("WS", "npx", ["tsx", "src/server/ws.ts"]);

// 2. BullMQ Transfer Worker
const workerProc = startProcess("WORKER", "npx", ["tsx", "src/server/worker.ts"]);

// 3. Next.js Web Server (Port $PORT or 3000)
const webProc = startProcess("WEB", "npx", ["next", "start"]);

function shutdown() {
  console.log("Terminating processes...");
  wsProc.kill();
  workerProc.kill();
  webProc.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
