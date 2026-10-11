import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller.js";
import { ReportsService } from "./reports.service.js";
import { GroqService } from "./groq.service.js";

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, GroqService],
})
export class ReportsModule {}
