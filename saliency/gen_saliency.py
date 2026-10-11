"""Occlusion-sensitivity saliency for the CareLens tflite models.

For each model we occlude 16x16 patches on a 224x224 grid, measure the drop in
the model's top-class probability, and overlay the resulting heatmap on the
input image. High-value (red) regions are the pixels the model relied on most.
"""

from __future__ import annotations

import os
import sys

import numpy as np
from ai_edge_litert.interpreter import Interpreter
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODELS_DIR = os.path.join(ROOT, "models")
IMAGE = os.path.join(ROOT, "carlens (1).jfif")
OUT_DIR = HERE

SIZE = 224
PATCH = 16
# (model_id, file, labels)
TARGETS = [
    ("pneumonia", "newPneumoniaModel.tflite",
     ["NORMAL", "BACTERIAL_PNEUMONIA", "VIRAL_PNEUMONIA"]),
    ("model", "model.tflite", ["NORMAL", "PNEUMONIA"]),
    ("model_unquant", "model_unquant.tflite", ["NORMAL", "PNEUMONIA"]),
]


def preprocess(rgb: np.ndarray) -> np.ndarray:
    arr = rgb.astype(np.float32) / 127.5 - 1.0
    return arr[None, ...]


def softmax(v: np.ndarray) -> np.ndarray:
    v = v - v.max()
    e = np.exp(v)
    return e / e.sum()


def probs_for(interp: Interpreter, rgb: np.ndarray) -> np.ndarray:
    i = interp.get_input_details()[0]
    o = interp.get_output_details()[0]
    interp.set_tensor(i["index"], preprocess(rgb))
    interp.invoke()
    raw = interp.get_tensor(o["index"]).flatten().astype(np.float64)
    if raw.min() < 0 or abs(raw.sum() - 1.0) > 0.01:
        raw = softmax(raw)
    return raw


def colormap(t: np.ndarray) -> np.ndarray:
    """t in [0,1] -> RGB uint8 (blue -> cyan -> green -> yellow -> red)."""
    r = np.clip(1.5 - np.abs(4 * t - 3), 0, 1)
    g = np.clip(1.5 - np.abs(4 * t - 2), 0, 1)
    b = np.clip(1.5 - np.abs(4 * t - 1), 0, 1)
    return (np.stack([r, g, b], axis=-1) * 255).astype(np.uint8)


def run(model_id: str, fname: str, labels: list[str], rgb0: np.ndarray) -> None:
    path = os.path.join(MODELS_DIR, fname)
    interp = Interpreter(model_path=path)
    interp.allocate_tensors()

    base = probs_for(interp, rgb0)
    top = int(np.argmax(base))
    print(f"[{model_id}] top={labels[top]} p={base[top]:.4f}")

    baseline = rgb0.reshape(-1, 3).mean(axis=0)  # neutral occluder

    heat = np.zeros((SIZE // PATCH, SIZE // PATCH), dtype=np.float64)
    for gy in range(0, SIZE, PATCH):
        for gx in range(0, SIZE, PATCH):
            occ = rgb0.copy()
            occ[gy:gy + PATCH, gx:gx + PATCH] = baseline
            heat[gy // PATCH, gx // PATCH] = base[top] - probs_for(interp, occ)[top]

    # keep only positive contributions, normalize
    heat = np.clip(heat, 0, None)
    heat = heat / (heat.max() + 1e-9)

    heat_img = Image.fromarray((heat * 255).astype(np.uint8), mode="L").resize(
        (SIZE, SIZE), Image.BICUBIC
    )
    heat_arr = np.asarray(heat_img).astype(np.float32) / 255.0
    color = colormap(heat_arr)
    overlay = (rgb0.astype(np.float32) * 0.45 + color.astype(np.float32) * 0.55)
    overlay = np.clip(overlay, 0, 255).astype(np.uint8)

    out = os.path.join(OUT_DIR, f"carlens_{model_id}_saliency.png")
    Image.fromarray(overlay).save(out)
    print(f"  saved {out}")

    # textual region summary (left/right, top/bottom, center vs overall)
    h, w = heat.shape
    hw, hh = w // 2, h // 2
    l = heat[:, :hw].mean()
    r = heat[:, hw:].mean()
    t = heat[:hh, :].mean()
    b = heat[hh:, :].mean()
    cy0, cy1, cx0, cx1 = h // 4, 3 * h // 4, w // 4, 3 * w // 4
    center = heat[cy0:cy1, cx0:cx1].mean()
    print(f"  importance L={l:.3f} R={r:.3f}  T={t:.3f} B={b:.3f}  "
          f"overall={heat.mean():.3f} center={center:.3f} "
          f"(peak={heat.max():.2f} of grid max)")


def main() -> int:
    img = Image.open(IMAGE).convert("RGB").resize((SIZE, SIZE))
    rgb0 = np.asarray(img, dtype=np.uint8)
    overlays = [rgb0]
    for model_id, fname, labels in TARGETS:
        run(model_id, fname, labels, rgb0)
        overlays.append(
            np.asarray(
                Image.open(
                    os.path.join(OUT_DIR, f"carlens_{model_id}_saliency.png")
                ).convert("RGB")
            )
        )
    # montage: original | pneumonia | model | model_unquant
    gap = np.full((SIZE, 6, 3), 255, dtype=np.uint8)
    tiles = []
    for i, ov in enumerate(overlays):
        if i:
            tiles.append(gap)
        tiles.append(ov)
    montage = np.concatenate(tiles, axis=1)
    out = os.path.join(OUT_DIR, "carlens_saliency_montage.png")
    Image.fromarray(montage).save(out)
    print(f"  saved {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
