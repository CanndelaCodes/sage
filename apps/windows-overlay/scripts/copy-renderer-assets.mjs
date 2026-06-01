import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const rendererOut = path.join(root, "dist", "renderer");

await mkdir(rendererOut, { recursive: true });
await copyFile(path.join(root, "src", "renderer", "index.html"), path.join(rendererOut, "index.html"));
await copyFile(path.join(root, "src", "renderer", "styles.css"), path.join(rendererOut, "styles.css"));
