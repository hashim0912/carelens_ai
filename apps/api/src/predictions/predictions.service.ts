import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class PredictionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getByScan(scanId: string) {
    const prediction = await this.prisma.prediction.findUnique({
      where: { scanId },
    });
    if (!prediction) throw new NotFoundException("No prediction for this scan");
    return prediction;
  }
}