import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { buildReportContent, getModel, type ReportPrediction } from "@carelens/ml";
import {
  clinicalContextSchemaForDomain,
  reportRequestSchema,
  scanReportSchema,
  type ReportContent,
  type ReportRequest,
} from "@carelens/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthUser } from "../auth/jwt-auth.guard.js";
import { GroqService } from "./groq.service.js";
import { renderReportPdf } from "./pdf.js";

export interface ReportFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groq: GroqService,
  ) {}

  /**
   * Generates a PDF report for a completed scan. The classifier output comes
   * from the request verbatim; only the narrative is generated (Groq, or a
   * deterministic template fallback) and cached on `Scan.report`.
   */
  async generate(
    user: AuthUser,
    file: ReportFile,
    rawReport: string,
  ): Promise<{ pdf: Buffer; filename: string }> {
    let json: unknown;
    try {
      json = JSON.parse(rawReport);
    } catch {
      throw new BadRequestException("report must be valid JSON");
    }

    const parsed = reportRequestSchema.safeParse(json);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid report request",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    const request: ReportRequest = parsed.data;

    const model = getModel(request.modelId);
    if (!model) throw new BadRequestException(`Unknown model: ${request.modelId}`);

    let clinicalContext: Record<string, unknown> | null | undefined;
    if (request.clinicalContext != null) {
      const context = clinicalContextSchemaForDomain(model.domain).safeParse(
        request.clinicalContext,
      );
      if (!context.success) {
        throw new BadRequestException({
          message: `Invalid clinical context for a ${model.domain} model.`,
          issues: context.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }
      clinicalContext = context.data as Record<string, unknown>;
    }

    const prediction: ReportPrediction = {
      modelId: request.modelId,
      label: request.label,
      confidence: request.confidence,
      scores: request.scores,
      accuracy: request.accuracy ?? model.accuracy,
      lowConfidenceDomain: request.lowConfidenceDomain,
    };

    // A report already cached on the scan is reused so re-downloads are stable
    // and do not re-query the LLM.
    let cachedContent: ReportContent | undefined;
    let generatedBy = "template";
    let aiGenerated = false;
    let scan: { id: string; userId: string; report: unknown } | null = null;

    if (request.scanId) {
      scan = await this.prisma.scan.findUnique({
        where: { id: request.scanId },
        select: { id: true, userId: true, report: true },
      });
      if (!scan) throw new NotFoundException("Scan not found");
      if (user.role !== "ADMIN" && scan.userId !== user.id) {
        throw new ForbiddenException("Not your scan");
      }
      const cached = scanReportSchema.safeParse(scan.report);
      if (cached.success) {
        cachedContent = cached.data.content;
        generatedBy = cached.data.generatedBy;
        aiGenerated = cached.data.aiGenerated;
      }
    }

    let content = cachedContent;
    if (!content) {
      content = buildReportContent(model.domain, prediction);
      if (this.groq.isConfigured()) {
        try {
          const result = await this.groq.generateReport(
            model.domain,
            prediction,
            clinicalContext,
          );
          content = result.content;
          generatedBy = result.modelId;
          aiGenerated = true;
        } catch (err) {
          this.logger.warn(
            `Groq report generation failed; using template. ${String(err)}`,
          );
        }
      }

      if (scan && request.scanId) {
        const record = {
          content,
          generatedBy,
          aiGenerated,
          modelId: request.modelId,
          generatedAt: new Date().toISOString(),
        };
        await this.prisma.scan.update({
          where: { id: request.scanId },
          data: { report: record as unknown as Prisma.InputJsonValue },
        });
      }
    }

    const pdf = await renderReportPdf({
      scanId: request.scanId,
      generatedAt: new Date(),
      generatedBy,
      aiGenerated,
      model: {
        id: model.id,
        file: model.file,
        domain: model.domain,
        classLabels: model.classLabels,
        accuracy: model.accuracy,
      },
      prediction,
      clinicalContext,
      content,
      image: {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
      },
    });

    const suffix = (request.scanId ?? new Date().toISOString().slice(0, 10)).slice(0, 36);
    return { pdf, filename: `carelens-report-${suffix}.pdf` };
  }
}
