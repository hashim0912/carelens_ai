declare module "jpeg-js" {
  export interface DecodeResult {
    width: number;
    height: number;
    data: Uint8Array;
  }
  export function decode(
    data: Uint8Array | ArrayBuffer,
    options?: { useTArray?: boolean; formatAsRGBA?: boolean },
  ): DecodeResult;
}
