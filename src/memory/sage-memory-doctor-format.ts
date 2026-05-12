import { colorize, isRich, theme } from "../terminal/theme.js";
import { shortenHomePath } from "../utils.js";
import {
  type SageMemoryDoctorCheckStatus,
  type SageMemoryDoctorReport,
} from "./sage-memory-doctor.js";

export function formatDoctorReport(report: SageMemoryDoctorReport): string {
  const rich = isRich();
  const heading = (text: string) => colorize(rich, theme.heading, text);
  const muted = (text: string) => colorize(rich, theme.muted, text);
  const info = (text: string) => colorize(rich, theme.info, text);
  const success = (text: string) => colorize(rich, theme.success, text);
  const warn = (text: string) => colorize(rich, theme.warn, text);
  const fail = (text: string) => colorize(rich, theme.error, text);
  const label = (text: string) => muted(`${text}:`);
  const lines = [
    `${heading("Sage Memory Doctor")} ${muted(`(${report.agentId})`)}`,
    report.baseUrl ? `${label("Endpoint")} ${info(report.baseUrl)}` : null,
    report.diagnosticNamespace
      ? `${label("Diagnostic namespace")} ${info(report.diagnosticNamespace)}`
      : null,
    report.marker ? `${label("Marker")} ${info(report.marker)}` : null,
    report.sessionNodePath ? `${label("Session node")} ${success(report.sessionNodePath)}` : null,
    report.captureQueue
      ? `${label("Capture queue")} ${info(
          `${report.captureQueue.counts.total} total (${report.captureQueue.counts.pending} pending, ${report.captureQueue.counts.failed} failed)`,
        )}`
      : null,
  ].filter(Boolean) as string[];
  for (const check of report.checks) {
    lines.push(
      `${formatDoctorStatus(check.status, { success, warn, fail })} ${check.name}: ${check.message}`,
    );
  }
  if (report.exportedFiles.length > 0) {
    lines.push(label("Exported files"));
    for (const file of report.exportedFiles) {
      lines.push(`  ${info(shortenHomePath(file))}`);
    }
  }
  if (report.suggestions.length > 0) {
    lines.push(label("Suggestions"));
    for (const suggestion of report.suggestions) {
      lines.push(`  ${info(suggestion)}`);
    }
  }
  return lines.join("\n");
}

function formatDoctorStatus(
  status: SageMemoryDoctorCheckStatus,
  colors: {
    success: (text: string) => string;
    warn: (text: string) => string;
    fail: (text: string) => string;
  },
): string {
  if (status === "pass") {
    return colors.success("[pass]");
  }
  if (status === "warn") {
    return colors.warn("[warn]");
  }
  return colors.fail("[fail]");
}
