import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreatePatientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsISO8601()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(["MALE", "FEMALE", "OTHER"])
  sex?: "MALE" | "FEMALE" | "OTHER";
}