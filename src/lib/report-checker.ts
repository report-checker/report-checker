import { invoke } from "@tauri-apps/api/core";

import type { CheckerConfig } from "@/lib/checker-config";
import {
  type FileCheckResult,
  type ParsedPdfResult,
  runRulesEngine,
  summarizeRules,
} from "@/lib/rules-engine";

type ParsePdfInput = {
  pdfBytes: number[];
};

function toParsePayload(bytes: Uint8Array): {
  input: ParsePdfInput;
} {
  return {
    input: {
      pdfBytes: Array.from(bytes),
    },
  };
}

async function parsePdfWithTauri(bytes: Uint8Array): Promise<ParsedPdfResult> {
  return invoke<ParsedPdfResult>("parse_pdf_report", toParsePayload(bytes));
}

function normalizeProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export async function runReportChecks(
  files: File[],
  config: CheckerConfig,
  onProgress?: (step: string, progress: number) => void,
  onFileResult?: (result: FileCheckResult) => void,
): Promise<FileCheckResult[]> {
  const checkedAt = new Date().toLocaleString("ru-RU");
  const results: FileCheckResult[] = [];
  const total = files.length;
  let lastProgress = 0;

  const emitProgress = (step: string, progress: number) => {
    const normalizedProgress = normalizeProgress(progress);
    if (normalizedProgress + Number.EPSILON < lastProgress) {
      return;
    }
    lastProgress = normalizedProgress;
    onProgress?.(step, normalizedProgress);
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    emitProgress(`Чтение файла: ${file.name}`, i / total);
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const engineResult = await runRulesEngine(
      {
        pdfBytes: bytes,
        config,
        marginGeometryEngine: config.marginGeometryEngine,
      },
      {
        parsePdf: async (b) => {
          emitProgress(`Разбор PDF: ${file.name}`, (i + 0.33) / total);
          const result = await parsePdfWithTauri(b);
          emitProgress(`Проверка правил: ${file.name}`, (i + 0.67) / total);
          return result;
        },
      },
    );

    const summary = summarizeRules(engineResult.rules);
    const fileResult: FileCheckResult = {
      fileName: file.name,
      fileSizeBytes: file.size,
      checkedAt,
      marginGeometryEngine: config.marginGeometryEngine,
      summary,
      rules: engineResult.rules,
    };

    onFileResult?.(fileResult);
    results.push(fileResult);
    emitProgress(`Готово: ${file.name}`, (i + 1) / total);
  }

  return results;
}

export type {
  CheckSummary,
  FileCheckResult,
  MarginGeometryEngine,
  OverlayBox,
  OverlayStyle,
  PdfRect,
  RuleResult,
  RuleStatus,
} from "@/lib/rules-engine";
export {
  marginGeometryEngineLabels,
  marginGeometryEngineValues,
} from "@/lib/rules-engine";
