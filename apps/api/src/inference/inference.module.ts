import { Module } from "@nestjs/common";
import { InferenceController } from "./inference.controller.js";

@Module({
  controllers: [InferenceController],
})
export class InferenceModule {}