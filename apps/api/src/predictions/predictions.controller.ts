import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { PredictionsService } from "./predictions.service.js";

@UseGuards(JwtAuthGuard)
@Controller("predictions")
export class PredictionsController {
  constructor(private readonly predictions: PredictionsService) {}

  @Get(":scanId")
  getByScan(@Param("scanId") scanId: string) {
    return this.predictions.getByScan(scanId);
  }
}