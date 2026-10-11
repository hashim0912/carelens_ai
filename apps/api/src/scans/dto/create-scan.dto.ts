import { IsObject, IsOptional, IsString } from "class-validator";

export class CreateScanDto {
  @IsString()
  modelId!: string;

  @IsOptional()
  @IsString()
  patientId?: string;

  /**
   * Domain-specific clinical intake answers (context only). Validated against
   * the selected model's domain schema in the service, not here.
   */
  @IsOptional()
  @IsObject()
  clinicalContext?: Record<string, unknown>;
}
