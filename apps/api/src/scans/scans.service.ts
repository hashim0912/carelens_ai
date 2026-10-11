import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { getModel } from "@carelens/ml";
import { clinicalContextSchemaForDomain } from "@carelens/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateScanDto } from "./dto/create-scan.dto.js";
import type { SubmitResultDto } from "./dto/submit-result.dto.js";

@Injectable()
export class ScansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateScanDto) {
    const model = getModel(dto.modelId);
    if (!model) {
      throw new BadRequestException(`Unknown model: ${dto.modelId}`);
    }

    // Clinical context is context-only (never fed to the model), but it must
    // still match the selected model's domain so a chest scan cannot carry
    // brain answers.
    let clinicalContext: Prisma.InputJsonValue | undefined;
    if (dto.clinicalContext !== undefined) {
      const parsed = clinicalContextSchemaForDomain(model.domain).safeParse(
        dto.clinicalContext,
      );
      if (!parsed.success) {
        throw new BadRequestException({
          message: `Invalid clinical context for a ${model.domain} model.`,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }
      clinicalContext = parsed.data as Prisma.InputJsonValue;
    }

    return this.prisma.scan.create({
      data: {
        userId,
        modelId: dto.modelId,
        patientId: dto.patientId ?? null,
        ...(clinicalContext !== undefined ? { clinicalContext } : {}),
      },
    });
  }

  async list(userId: string, role: string) {
    const where = role === "ADMIN" ? {} : { userId };
    const [scans, total, completed, failed] = await Promise.all([
      this.prisma.scan.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      this.prisma.scan.count({ where }),
      this.prisma.scan.count({ where: { ...where, status: "COMPLETED" } }),
      this.prisma.scan.count({ where: { ...where, status: "FAILED" } }),
    ]);
    return { scans, counts: { total, completed, failed } };
  }

  async getById(id: string) {
    const scan = await this.prisma.scan.findUnique({
      where: { id },
    });
    if (!scan) throw new NotFoundException("Scan not found");
    return scan;
  }

  async submitResult(
    scanId: string,
    userId: string,
    role: string,
    dto: SubmitResultDto,
  ) {
    const scan = await this.prisma.scan.findUnique({ where: { id: scanId } });
    if (!scan) throw new NotFoundException("Scan not found");
    if (role !== "ADMIN" && scan.userId !== userId) {
      throw new ForbiddenException("Not your scan");
    }

    const details = dto.scores as unknown as Prisma.InputJsonValue;

    const prediction = await this.prisma.prediction.upsert({
      where: { scanId },
      create: {
        scanId,
        modelId: dto.modelId,
        label: dto.label,
        confidence: dto.confidence,
        details,
      },
      update: {
        modelId: dto.modelId,
        label: dto.label,
        confidence: dto.confidence,
        details,
      },
    });

    await this.prisma.scan.update({
      where: { id: scanId },
      data: { status: "COMPLETED" },
    });

    return prediction;
  }

  /**
   * Mark a scan as FAILED without creating any Prediction row. Used when the
   * image was rejected by validation (non-medical image / wrong model domain)
   * so a rejected attempt can never be mistaken for a real result.
   */
  async fail(scanId: string, userId: string, role: string) {
    const scan = await this.prisma.scan.findUnique({ where: { id: scanId } });
    if (!scan) throw new NotFoundException("Scan not found");
    if (role !== "ADMIN" && scan.userId !== userId) {
      throw new ForbiddenException("Not your scan");
    }
    // Guarantee no stale prediction survives a rejection.
    await this.prisma.prediction.deleteMany({ where: { scanId } });
    return this.prisma.scan.update({
      where: { id: scanId },
      data: { status: "FAILED" },
    });
  }
}