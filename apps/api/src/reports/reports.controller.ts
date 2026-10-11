import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard, type AuthUser } from "../auth/jwt-auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ReportsService } from "./reports.service.js";

interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@UseGuards(JwtAuthGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * `multipart/form-data`:
   *  - `file`   - the scanned image, embedded in the PDF (not persisted)
   *  - `report` - JSON string of the classifier output + optional context
   *
   * Returns the generated PDF as an attachment.
   */
  @Post()
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async create(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body("report") report: string | undefined,
  ): Promise<StreamableFile> {
    if (!file) throw new BadRequestException("file is required");
    if (!report) throw new BadRequestException("report is required");

    const { pdf, filename } = await this.reports.generate(user, file, report);
    return new StreamableFile(pdf, {
      type: "application/pdf",
      disposition: `attachment; filename="${filename}"`,
      length: pdf.length,
    });
  }
}
