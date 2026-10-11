import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";

interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@UseGuards(JwtAuthGuard)
@Controller("inference")
export class InferenceController {
  @Post("predict")
  @UseInterceptors(FileInterceptor("file"))
  async predict(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body("model_id") modelId?: string,
  ) {
    if (!file) throw new BadRequestException("file is required");

    const base = process.env.INFERENCE_URL ?? "http://localhost:8001";
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );
    form.append("model_id", modelId ?? "pneumonia");

    let res: Response;
    try {
      res = await fetch(`${base}/predict`, { method: "POST", body: form });
    } catch (err) {
      throw new HttpException(
        `Inference service unreachable: ${String(err)}`,
        502,
      );
    }
    if (!res.ok) {
      // Pass the upstream status AND body through unchanged. In particular a
      // 422 REJECTED (non-medical / model-image mismatch) response must not be
      // flattened into a 500 or a stringified blob.
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const payload: unknown = await res.json();
        throw new HttpException(payload as object, res.status);
      }
      throw new HttpException(await res.text(), res.status);
    }
    return (await res.json()) as unknown;
  }
}