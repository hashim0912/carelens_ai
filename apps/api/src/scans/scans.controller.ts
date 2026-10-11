import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthUser, JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { CreateScanDto } from "./dto/create-scan.dto.js";
import { SubmitResultDto } from "./dto/submit-result.dto.js";
import { ScansService } from "./scans.service.js";

@UseGuards(JwtAuthGuard)
@Controller("scans")
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.scans.list(user.id, user.role);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateScanDto) {
    return this.scans.create(user.id, dto);
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.scans.getById(id);
  }

  @Post(":id/result")
  submitResult(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitResultDto,
  ) {
    return this.scans.submitResult(id, user.id, user.role, dto);
  }

  @Post(":id/fail")
  fail(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.scans.fail(id, user.id, user.role);
  }
}