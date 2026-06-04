import { createServer } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const overlayDir = path.resolve(import.meta.dirname, "..");
const distDir = path.join(overlayDir, "dist");
const reviewFile = path.join(distDir, "overlay-visual-review.html");
const acceptanceFile = path.join(distDir, "overlay-visual-review-acceptance.json");
const host = "127.0.0.1";
const port = readPort();

await fs.access(reviewFile);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}/`);
  if (request.method === "POST") {
    if (url.pathname !== "/acceptance") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    await writeAcceptancePacket(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, {
      "content-type": "text/plain; charset=utf-8",
      allow: "GET, HEAD, POST",
    });
    response.end("Method not allowed");
    return;
  }

  const targetPath = resolveRequestPath(request.url ?? "/");
  if (!targetPath) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const body = await fs.readFile(targetPath);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentType(targetPath),
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("SageOS visual review server did not expose a TCP port.");
  }
  console.log(`SageOS visual review available at http://${host}:${address.port}/`);
});

function readPort() {
  const fromArg = process.argv.find((arg) => arg.startsWith("--port="))?.slice("--port=".length);
  const raw = fromArg || process.env.SAGEOS_VISUAL_REVIEW_PORT || "0";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new Error(`Invalid SAGEOS_VISUAL_REVIEW_PORT: ${raw}`);
  }
  return parsed;
}

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://${host}/`);
  const decodedPath = decodeURIComponent(url.pathname);
  const relativePath =
    decodedPath === "/" ? "overlay-visual-review.html" : decodedPath.replace(/^\/+/, "");
  const targetPath = path.resolve(distDir, relativePath);
  const relativeToDist = path.relative(distDir, targetPath);
  if (relativeToDist.startsWith("..") || path.isAbsolute(relativeToDist)) {
    return undefined;
  }
  return targetPath;
}

async function writeAcceptancePacket(request, response) {
  try {
    const packet = JSON.parse(await readRequestBody(request));
    validateAcceptancePacket(packet);
    await atomicWriteJson(acceptanceFile, packet);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    });
    response.end(
      JSON.stringify({
        ok: true,
        file: "overlay-visual-review-acceptance.json",
        humanAcceptance: packet.humanAcceptance,
      }),
    );
  } catch (error) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Invalid SageOS visual acceptance packet");
  }
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 64 * 1024) {
      throw new Error("Invalid SageOS visual acceptance packet: body is too large.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function validateAcceptancePacket(packet) {
  if (!packet || typeof packet !== "object") {
    throw new Error("Invalid SageOS visual acceptance packet: expected JSON object.");
  }
  if (packet.type !== "sageos.overlay.visualReview.acceptance") {
    throw new Error("Invalid SageOS visual acceptance packet: unexpected packet type.");
  }
  if (packet.humanAcceptance !== "accepted" && packet.humanAcceptance !== "required") {
    throw new Error("Invalid SageOS visual acceptance packet: invalid humanAcceptance.");
  }
  if (!packet.summary || typeof packet.summary.releaseState !== "string") {
    throw new Error("Invalid SageOS visual acceptance packet: missing summary.");
  }
  if (!Array.isArray(packet.decisions) || packet.decisions.length !== 8) {
    throw new Error("Invalid SageOS visual acceptance packet: expected 8 decisions.");
  }
}

async function atomicWriteJson(filePath, packet) {
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

function contentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}
