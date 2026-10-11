import {
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

class ScoreDto {
  @IsString()
  label!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;
}

export class SubmitResultDto {
  @IsString()
  modelId!: string;

  @IsString()
  label!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ScoreDto)
  scores!: ScoreDto[];
}