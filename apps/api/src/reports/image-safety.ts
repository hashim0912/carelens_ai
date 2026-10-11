import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPng(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE);
}

/**
 * True when a PNG's pixel data can be inflated.
 *
 * PDFKit decodes PNG pixels with `png-js`, whose `decodePixels` runs
 * `zlib.inflate(data, (err) => { if (err) throw err; })`. That `throw` happens
 * inside an async zlib callback with no surrounding try/catch, so a single
 * corrupt (or unsupported) PNG — any RGBA / paletted-with-tRNS / interlaced
 * image — takes down the entire API process. We inflate the same IDAT bytes up
 * front so a bad image can be skipped instead of crashing the server.
 */
export function pngPixelsInflate(buffer: Buffer): boolean {
  if (!isPng(buffer)) return false;

  const idats: Buffer[] = [];
  let pos = 8;
  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const dataStart = pos + 8;
    const dataEnd = dataStart + length;
    // `length` is unsigned; the bound check catches truncation/oversized chunks.
    if (dataEnd + 4 > buffer.length) return false;
    if (type === "IDAT") idats.push(buffer.subarray(dataStart, dataEnd));
    pos = dataEnd + 4; // skip the 4-byte CRC
    if (type === "IEND") break;
  }

  if (idats.length === 0) return false;
  try {
    inflateSync(Buffer.concat(idats));
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the uploaded image is safe to hand to PDFKit. PNGs are validated
 * because their async decoder can crash the process; JPEGs and other formats
 * fail synchronously inside `openImage` and are caught by the caller.
 */
export function isEmbeddableImage(buffer: Buffer): boolean {
  return isPng(buffer) ? pngPixelsInflate(buffer) : true;
}
