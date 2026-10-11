import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const logger = new Logger("Bootstrap");

/**
 * PDFKit's image decoders (`png-js`, `jpeg-js`) can `throw` from inside an
 * async zlib callback, which surfaces as an uncaught exception and would kill
 * the whole API on a single malformed upload. Reports already guard against
 * this (see `reports/image-safety.ts`), but a malformed image must never be able to take
 * the server down, so swallow decoder-specific errors and keep serving.
 * Everything else keeps the default "crash loudly" behaviour.
 */
process.on("uncaughtException", (err) => {
  const code = (err as NodeJS.ErrnoException).code;
  const stack = err instanceof Error ? (err.stack ?? "") : "";
  const isImageDecoderError =
    code === "Z_DATA_ERROR" || code === "Z_BUF_ERROR" || /png-js|jpeg-js/.test(stack);
  const message = err instanceof Error ? err.message : String(err);
  if (isImageDecoderError) {
    logger.warn(`Ignored image-decoder error from a malformed upload: ${message}`);
    return;
  }
  logger.error(err instanceof Error ? (err.stack ?? message) : message);
  process.exit(1);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(",") ?? true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.setGlobalPrefix("api");

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`CareLens API listening on http://localhost:${port}/api`);
}

void bootstrap();