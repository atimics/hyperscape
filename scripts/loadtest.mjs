#!/usr/bin/env node
/**
 * Starts dev server and runs load test bots
 */

import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

const opts = parseArgs({
  options: {
    help: { type: "boolean", short: "h" },
    bots: { type: "string", short: "b", default: "10" },
    behavior: { type: "string", default: "wander" },
    duration: { type: "string", short: "d", default: "60" },
    "skip-dev": { type: "boolean" },
    "rendering-test": { type: "boolean" },
    "ccu-test": { type: "boolean" },
  },
  strict: true,
}).values;

if (opts.help) {
  console.log(`
Load Test Runner - starts dev server and runs load test bots

Usage: bun run loadtest [options]

Options:
  -h, --help           Show help
  -b, --bots <n>       Number of bots (default: 10)
  --behavior <type>    idle, wander, explore, sprint (default: wander)
  -d, --duration <s>   Duration in seconds (default: 60)
  --skip-dev           Don't start dev server (assume already running)
  --rendering-test     Run rendering test (100 idle bots, FPS measurement)
  --ccu-test           Run CCU stress test (1000 bots)

Examples:
  bun run loadtest                    # 10 bots, 60s
  bun run loadtest --bots=50          # 50 bots
  bun run loadtest --ccu-test         # 1000 bot stress test
  bun run loadtest --rendering-test   # FPS measurement with Playwright
`);
  process.exit(0);
}

const HEALTH_URL = "http://localhost:5555/health";
const MAX_WAIT = 120000; // 2 minutes

async function waitForServer() {
  const start = Date.now();
  process.stdout.write("Waiting for server");
  
  while (Date.now() - start < MAX_WAIT) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(HEALTH_URL, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        console.log(" ready!");
        return true;
      }
    } catch {}
    process.stdout.write(".");
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(" timeout!");
  return false;
}

async function startDev() {
  console.log("Starting dev server...\n");
  
  const dev = spawn("bun", ["run", "dev"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  // Stream server output with prefix
  dev.stdout.on("data", (data) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      console.log(`[dev] ${line}`);
    }
  });
  
  dev.stderr.on("data", (data) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      console.log(`[dev] ${line}`);
    }
  });

  dev.on("error", (err) => {
    console.error("Failed to start dev server:", err.message);
  });

  return dev;
}

async function runLoadTest() {
  const args = [];
  
  if (opts["rendering-test"]) {
    args.push("scripts/load-test-rendering.mjs");
    args.push(`--bots=${opts.bots}`);
    args.push(`--duration=${opts.duration}`);
  } else {
    args.push("scripts/load-test.mjs");
    
    if (opts["ccu-test"]) {
      args.push("--ccu-test");
    } else {
      args.push(`--bots=${opts.bots}`);
      args.push(`--behavior=${opts.behavior}`);
      args.push(`--duration=${opts.duration}`);
    }
  }

  console.log(`\nRunning: bun ${args.join(" ")}\n`);

  return new Promise((resolve) => {
    const test = spawn("bun", args, {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    test.on("close", (code) => resolve(code));
    test.on("error", () => resolve(1));
  });
}

async function main() {
  let devProcess = null;

  const cleanup = () => {
    if (devProcess) {
      console.log("\nStopping dev server...");
      try {
        process.kill(-devProcess.pid, "SIGTERM");
      } catch {
        devProcess.kill("SIGTERM");
      }
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Start dev server unless skipped
  if (!opts["skip-dev"]) {
    devProcess = await startDev();
    
    // Wait for server to be ready
    const ready = await waitForServer();
    if (!ready) {
      console.error("Server failed to start within 2 minutes");
      cleanup();
      process.exit(1);
    }
    
    // Extra settle time
    await new Promise(r => setTimeout(r, 2000));
  } else {
    // Verify server is already running
    console.log("Checking if server is running...");
    const ready = await waitForServer();
    if (!ready) {
      console.error("Server not running. Start with 'bun run dev' or remove --skip-dev");
      process.exit(1);
    }
  }

  // Run load test
  const exitCode = await runLoadTest();

  // Cleanup
  if (devProcess) {
    console.log("\nStopping dev server...");
    try {
      process.kill(-devProcess.pid, "SIGTERM");
    } catch {
      devProcess.kill("SIGTERM");
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
