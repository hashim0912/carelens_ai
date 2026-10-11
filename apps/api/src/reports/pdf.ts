import PDFDocument from "pdfkit";
import {
  CLINICAL_DOMAIN_LABELS,
  describeClinicalContext,
  REPORT_AI_LABEL,
  REPORT_CONTEXT_NOTE,
  REPORT_DISCLAIMER,
  REPORT_TEMPLATE_LABEL,
  type ModelDomain,
  type ReportPrediction,
} from "@carelens/ml";
import type { ReportContent } from "@carelens/shared";
import { isEmbeddableImage } from "./image-safety.js";

const ACCENT = "#0d9488";
const DARK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const WARN = "#b45309";

export interface ReportPdfInput {
  scanId?: string;
  generatedAt: Date;
  generatedBy: string;
  aiGenerated: boolean;
  model: {
    id: string;
    file: string;
    domain: ModelDomain;
    classLabels: string[];
    accuracy: string;
  };
  prediction: ReportPrediction;
  clinicalContext?: Record<string, unknown> | null;
  content: ReportContent;
  image: { buffer: Buffer; mimetype: string; originalname: string };
}

/**
 * Renders a scan report to a PDF buffer.
 *
 * Built-in Helvetica only supports a Latin-1 subset, so all dynamic text is
 * sanitised to common ASCII before it is written.
 */
export function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      drawReport(doc, input);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    doc.end();
  });
}

function sanitize(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00d7/g, "x")
    .replace(/\u2022/g, "-")
    .replace(/[^\t\n\r\x20-\x7e\u00a0-\u00ff]/g, "");
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function margin(doc: PDFKit.PDFDocument): number {
  return doc.page.margins.left;
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - margin(doc) * 2;
}

function divider(doc: PDFKit.PDFDocument) {
  const y = doc.y + 4;
  doc.moveTo(margin(doc), y).lineTo(margin(doc) + contentWidth(doc), y).lineWidth(1).strokeColor(LINE).stroke();
  doc.y = y + 8;
}

function section(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.7);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(ACCENT).text(sanitize(title));
  doc.moveDown(0.25);
}

function paragraph(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica").fontSize(10).fillColor(DARK).text(sanitize(text), {
    width: contentWidth(doc),
    align: "left",
  });
  doc.moveDown(0.2);
}

function bullets(doc: PDFKit.PDFDocument, items: string[]) {
  const m = margin(doc);
  const width = contentWidth(doc);
  for (const item of items) {
    const y = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor(ACCENT).text("-", m, y, { width: 12 });
    doc.font("Helvetica").fontSize(10).fillColor(DARK).text(sanitize(item), m + 14, y, {
      width: width - 14,
    });
    doc.y = Math.max(doc.y, y + 13) + 2;
  }
}

function keyValues(doc: PDFKit.PDFDocument, rows: Array<[string, string]>) {
  const m = margin(doc);
  const labelWidth = 130;
  const valueWidth = contentWidth(doc) - labelWidth - 8;
  for (const [label, value] of rows) {
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(MUTED).text(sanitize(label), m, y, {
      width: labelWidth,
    });
    doc.font("Helvetica").fontSize(10).fillColor(DARK).text(sanitize(value), m + labelWidth + 8, y, {
      width: valueWidth,
    });
    doc.y = Math.max(doc.y, y + 13) + 2;
  }
}

interface PdfImageLike {
  width: number;
  height: number;
}

/** `openImage` exists at runtime but is missing from `@types/pdfkit`. */
function openImage(doc: PDFKit.PDFDocument, buffer: Buffer): PdfImageLike {
  const opener = doc as unknown as { openImage(src: Buffer): PdfImageLike };
  return opener.openImage(buffer);
}

/** `doc.image` accepts a `PDFImage` (from `openImage`), which its types omit. */
function placeImage(
  doc: PDFKit.PDFDocument,
  image: PdfImageLike,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const draw = doc.image as unknown as (
    src: PdfImageLike,
    x: number,
    y: number,
    options: { width: number; height: number },
  ) => PDFKit.PDFDocument;
  draw.call(doc, image, x, y, { width, height });
}

function drawImage(doc: PDFKit.PDFDocument, input: ReportPdfInput) {
  const m = margin(doc);
  const maxWidth = contentWidth(doc) * 0.62;
  const maxHeight = 300;
  const y = doc.y;
  try {
    // Reject images that would crash PDFKit's async PNG decoder (see
    // `image-safety.ts`) before they are ever handed to it.
    if (!isEmbeddableImage(input.image.buffer)) {
      throw new Error("image is not embeddable");
    }
    const image = openImage(doc, input.image.buffer);
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const drawWidth = Math.max(1, Math.round(image.width * scale));
    const drawHeight = Math.max(1, Math.round(image.height * scale));
    placeImage(doc, image, m, y, drawWidth, drawHeight);
    doc.y = y + drawHeight + 10;
  } catch {
    doc
      .font("Helvetica-Oblique")
      .fontSize(10)
      .fillColor(MUTED)
      .text("(the uploaded image could not be embedded)", m, y, { width: maxWidth });
  }
}

function drawScores(doc: PDFKit.PDFDocument, scores: ReportPrediction["scores"]) {
  const m = margin(doc);
  const width = contentWidth(doc);
  const labelWidth = width * 0.4;
  const pctWidth = 52;
  const barX = m + labelWidth + pctWidth + 10;
  const barWidth = Math.max(40, m + width - barX);

  for (const score of scores) {
    const y = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor(DARK).text(sanitize(score.label), m, y, {
      width: labelWidth,
    });
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(DARK)
      .text(percent(score.confidence), m + labelWidth, y, { width: pctWidth, align: "right" });
    doc.roundedRect(barX, y + 2, barWidth, 6, 3).fillColor(LINE).fill();
    const filled = Math.max(2, barWidth * Math.min(1, Math.max(0, score.confidence)));
    doc.roundedRect(barX, y + 2, filled, 6, 3).fillColor(ACCENT).fill();
    doc.y = y + 14;
  }
}

function drawReport(doc: PDFKit.PDFDocument, input: ReportPdfInput) {
  const m = margin(doc);
  const width = contentWidth(doc);
  const domainLabel = CLINICAL_DOMAIN_LABELS[input.model.domain];

  doc.rect(0, 0, doc.page.width, 8).fill(ACCENT);

  doc.y = 60;
  doc.font("Helvetica-Bold").fontSize(22).fillColor(DARK).text("CareLens AI", m, doc.y, { width });
  doc.font("Helvetica").fontSize(11).fillColor(MUTED).text("Diagnostic support report", m, doc.y, { width });
  doc.moveDown(0.6);

  const generated = `${input.generatedAt.toISOString().replace("T", " ").slice(0, 19)} UTC`;
  keyValues(doc, [
    ["Report ID", input.scanId ?? "not saved to a scan"],
    ["Generated", generated],
    ["Model", `${input.model.id} (${input.model.file})`],
    ["Domain", domainLabel],
    ["Measured accuracy", input.model.accuracy],
  ]);

  divider(doc);

  section(doc, "Input image");
  drawImage(doc, input);

  section(doc, "Model result");
  doc.font("Helvetica-Bold").fontSize(20).fillColor(DARK).text(sanitize(input.prediction.label), m, doc.y, {
    width,
  });
  doc.font("Helvetica").fontSize(11).fillColor(MUTED).text(`Confidence ${percent(input.prediction.confidence)}`, m, doc.y, {
    width,
  });
  doc.moveDown(0.4);
  drawScores(doc, input.prediction.scores);
  doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text(
    "Scores are the verbatim output of the image model and were not altered.",
    m,
    doc.y,
    { width },
  );

  const context = input.clinicalContext
    ? describeClinicalContext(input.model.domain, input.clinicalContext)
    : [];
  if (context.length > 0) {
    divider(doc);
    section(doc, `${domainLabel} clinical context`);
    keyValues(
      doc,
      context.map((row) => [row.label, row.value] as [string, string]),
    );
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text(sanitize(REPORT_CONTEXT_NOTE), m, doc.y, {
      width,
    });
  }

  divider(doc);
  section(doc, "Impression & recommendations");
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(input.aiGenerated ? ACCENT : WARN)
    .text(sanitize(input.aiGenerated ? REPORT_AI_LABEL : REPORT_TEMPLATE_LABEL), m, doc.y, { width });
  doc
    .font("Helvetica-Oblique")
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      input.aiGenerated
        ? `Generated by ${sanitize(input.generatedBy)} from the values above only.`
        : "Generated from a deterministic template; no AI model was used.",
      m,
      doc.y,
      { width },
    );
  doc.moveDown(0.4);

  paragraph(doc, input.content.summary);

  if (input.content.findings.length > 0) {
    doc.moveDown(0.2);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text("Key findings");
    doc.moveDown(0.15);
    bullets(doc, input.content.findings);
  }
  if (input.content.recommendations.length > 0) {
    doc.moveDown(0.2);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text("General recommendations");
    doc.moveDown(0.15);
    bullets(doc, input.content.recommendations);
  }
  if (input.content.redFlags.length > 0) {
    doc.moveDown(0.2);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text("Seek urgent care if");
    doc.moveDown(0.15);
    bullets(doc, input.content.redFlags);
  }
  if (input.content.limitations.length > 0) {
    doc.moveDown(0.2);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text("Limitations");
    doc.moveDown(0.15);
    bullets(doc, input.content.limitations);
  }

  drawFooters(doc);
}

function drawFooters(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const m = margin(doc);
    const width = contentWidth(doc);
    const y = doc.page.height - doc.page.margins.bottom - 14;
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(sanitize(REPORT_DISCLAIMER), m, y, {
      width,
      align: "center",
    });
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(`Page ${i + 1} of ${range.count}`, m, y + 10, { width, align: "center" });
  }
}
