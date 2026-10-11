import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module.js";
import { HealthModule } from "./health/health.module.js";
import { InferenceModule } from "./inference/inference.module.js";
import { PatientsModule } from "./patients/patients.module.js";
import { PredictionsModule } from "./predictions/predictions.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { ScansModule } from "./scans/scans.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    ScansModule,
    PredictionsModule,
    InferenceModule,
    ReportsModule,
  ],
})
export class AppModule {}