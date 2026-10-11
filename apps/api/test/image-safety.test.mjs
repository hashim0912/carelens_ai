// Regression guard for the PDF image decoder crash.
//
// PDFKit decodes PNG pixels with `png-js`, which inflates the IDAT stream in an
// async zlib callback that `throw`s on error. That uncaught exception used to
// kill the whole API on a single corrupt upload. `image-safety.ts` inflates the
// same bytes up front so bad images are skipped instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, deflateSync } from "node:zlib";

import {
  isEmbeddableImage,
  isPng,
  pngPixelsInflate,
} from "../src/reports/image-safety.ts";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

// A small RGBA (color type 6) PNG, which forces PDFKit down the png-js pixel
// decode path.
function makeRgbaPng({ corrupt }) {
  const W = 8;
  const H = 8;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const raw = Buffer.alloc(H * (1 + W * 4));
  let p = 0;
  for (let y = 0; y < H; y++) {
    raw[p++] = 0;
    for (let x = 0; x < W; x++) {
      raw[p++] = (x * 32) % 256;
      raw[p++] = (y * 32) % 256;
      raw[p++] = 128;
      raw[p++] = 255;
    }
  }
  let idat = deflateSync(raw);
  if (corrupt) {
    idat = Buffer.from(idat);
    for (let i = 4; i < idat.length; i++) idat[i] ^= 0xa5;
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("isPng only matches the PNG signature", () => {
  assert.equal(isPng(makeRgbaPng({ corrupt: false })), true);
  assert.equal(isPng(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), false);
  assert.equal(isPng(Buffer.alloc(0)), false);
});

test("pngPixelsInflate accepts a valid PNG", () => {
  assert.equal(pngPixelsInflate(makeRgbaPng({ corrupt: false })), true);
});

test("pngPixelsInflate rejects a corrupt PNG instead of throwing", () => {
  assert.equal(pngPixelsInflate(makeRgbaPng({ corrupt: true })), false);
});

test("pngPixelsInflate rejects truncated / non-PNG input", () => {
  const png = makeRgbaPng({ corrupt: false });
  assert.equal(pngPixelsInflate(png.subarray(0, 30)), false);
  assert.equal(pngPixelsInflate(Buffer.from("not a png")), false);
  // PNG signature but no IDAT chunks.
  assert.equal(
    pngPixelsInflate(Buffer.concat([PNG_SIGNATURE, chunk("IEND", Buffer.alloc(0))])),
    false,
  );
});

test("isEmbeddableImage passes JPEG/unknown through and gates PNGs", () => {
  assert.equal(isEmbeddableImage(makeRgbaPng({ corrupt: false })), true);
  assert.equal(isEmbeddableImage(makeRgbaPng({ corrupt: true })), false);
  // JPEG (FF D8 FF) is not a PNG: PDFKit fails synchronously there, so allow it.
  assert.equal(isEmbeddableImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), true);
});
