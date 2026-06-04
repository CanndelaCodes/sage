import { spawn } from "node:child_process";
import path from "node:path";

const overlayDir = path.resolve(import.meta.dirname, "..");
const steps = [
  { name: "smoke:electron", args: ["run", "smoke:electron"] },
  { name: "review:visual", args: ["run", "review:visual"] },
  { name: "review:visual:verify", args: ["run", "review:visual:verify"] },
];

console.log("SageOS overlay visual review gate");

for (const step of steps) {
  console.log(`\n> ${step.name}`);
  const code = Number(await runPnpm(step.args));
  if (code !== 0) {
    console.error(
      `SageOS overlay visual review gate failed at ${step.name} with exit code ${code}.`,
    );
    process.exitCode = code;
    break;
  }
}

async function runPnpm(args) {
  return await new Promise((resolve) => {
    const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
    const commandArgs =
      process.platform === "win32"
        ? ["/d", "/s", "/c", ["pnpm", ...args].join(" ")]
        : args;
    const child = spawn(command, commandArgs, {
      cwd: overlayDir,
      stdio: "inherit",
    });

    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error(error);
      resolve(1);
    });
  });
}
