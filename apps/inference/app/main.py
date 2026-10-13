"""CareLens inference service.

Runs the extracted .tflite models. Serves predictions to the web app and is
the reference implementation that also lets us confirm each model's real
input/output tensor shapes (resolving the P0 manifest gaps).
"""

from __future__ import annotations

import base64
import io
import os
import threading
from typing import Any

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image

from . import models as model_registry
from . import validation

try:  # ai-edge-litert (new) first
    from ai_edge_litert.interpreter import Interpreter as _Interpreter  # type: ignore[import-not-found]
except ImportError:  # fallback to legacy tflite-runtime
    from tflite_runtime.interpreter import Interpreter as _Interpreter  # type: ignore[import-not-found]

app = FastAPI(title="CareLens Inference", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CARELENS_CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

_lock = threading.Lock()
_interp_cache: dict[str, Any] = {}

# Saliency generation constants
SALIENCY_SIZE = 224
SALIENCY_PATCH = 16


def _generate_saliency(
    interp: Any,
    image_uint8: np.ndarray,  # (224, 224, 3) uint8 [0, 255]
    input_details: dict[str, Any],
    output_details: dict[str, Any],
    top_class_idx: int,
) -> str:
    """
    Generate occlusion-sensitivity saliency heatmap on the input image.
    Expects image_uint8 as (H, W, 3) uint8 in [0, 255].
    Returns base64-encoded PNG.
    """
    # Preprocess function matching gen_saliency.py
    def preprocess(rgb: np.ndarray) -> np.ndarray:
        arr = rgb.astype(np.float32) / 127.5 - 1.0
        # Handle both NHWC and NCHW input shapes
        shape = tuple(int(v) for v in input_details["shape"])
        if len(shape) == 4:
            if shape[3] == 3:  # NHWC
                return arr[None, ...]  # (1, H, W, 3)
            elif shape[1] == 3:  # NCHW
                arr = np.transpose(arr, (2, 0, 1))
                return arr[None, ...]  # (1, 3, H, W)
        return arr[None, ...]

    def get_probs(rgb: np.ndarray) -> np.ndarray:
        """Run inference on uint8 RGB image, return probabilities [NORMAL, PNEUMONIA]."""
        tensor = preprocess(rgb)
        interp.set_tensor(input_details["index"], tensor)
        interp.invoke()
        out = interp.get_tensor(output_details["index"]).flatten().astype(np.float64)
        # Handle binary sigmoid output (single value) -> convert to [normal, pneumonia]
        if out.shape == (1,):
            p = float(out[0])
            return np.array([1.0 - p, p], dtype=np.float64)
        if out.min() < 0 or abs(out.sum() - 1.0) > 0.01:
            out = out - out.max()
            e = np.exp(out)
            out = e / e.sum()
        return out

    # Baseline on original image
    baseline_probs = get_probs(image_uint8)
    baseline_top = baseline_probs[top_class_idx]

    # Neutral occluder (mean pixel value of original image)
    occluder = image_uint8.reshape(-1, 3).mean(axis=0).astype(np.float32)

    grid_h = SALIENCY_SIZE // SALIENCY_PATCH
    grid_w = SALIENCY_SIZE // SALIENCY_PATCH
    heat = np.zeros((grid_h, grid_w), dtype=np.float64)

    for gy in range(0, SALIENCY_SIZE, SALIENCY_PATCH):
        for gx in range(0, SALIENCY_SIZE, SALIENCY_PATCH):
            occ = image_uint8.copy()
            occ[gy:gy + SALIENCY_PATCH, gx:gx + SALIENCY_PATCH] = occluder
            probs = get_probs(occ)
            heat[gy // SALIENCY_PATCH, gx // SALIENCY_PATCH] = baseline_top - probs[top_class_idx]

    # Keep only positive contributions
    heat = np.clip(heat, 0, None)

    # Proper normalization with contrast stretching
    min_val = float(heat.min())
    max_val = float(heat.max())
    if max_val - min_val > 1e-7:
        heat_norm = (heat - min_val) / (max_val - min_val)
    else:
        heat_norm = np.zeros_like(heat, dtype=np.float64)

    # Upsample to image size
    from PIL import Image as PILImage

    heat_img = PILImage.fromarray((heat_norm * 255).astype(np.uint8), mode="L").resize(
        (SALIENCY_SIZE, SALIENCY_SIZE), PILImage.BICUBIC
    )
    heat_arr = np.asarray(heat_img).astype(np.float32) / 255.0

    # Apply JET colormap (matplotlib-style) for high visibility
    # jet colormap: blue -> cyan -> green -> yellow -> red
    def apply_jet_colormap(gray: np.ndarray) -> np.ndarray:
        """Apply jet colormap to grayscale [0,1] array, returns RGB [0,255] uint8."""
        # Clip to [0, 1]
        gray = np.clip(gray, 0, 1)
        # Jet colormap computation
        # 4 segments: [0, 0.25) blue->cyan, [0.25, 0.5) cyan->green, [0.5, 0.75) green->yellow, [0.75, 1] yellow->red
        r = np.zeros_like(gray)
        g = np.zeros_like(gray)
        b = np.zeros_like(gray)

        # Segment 1: 0.0 - 0.35 (blue to cyan)
        m1 = gray < 0.35
        r[m1] = 0
        g[m1] = gray[m1] / 0.35
        b[m1] = 1.0

        # Segment 2: 0.35 - 0.65 (cyan to green)
        m2 = (gray >= 0.35) & (gray < 0.65)
        r[m2] = 0
        g[m2] = 1.0
        b[m2] = 1.0 - (gray[m2] - 0.35) / 0.30

        # Segment 3: 0.65 - 0.85 (green to yellow)
        m3 = (gray >= 0.65) & (gray < 0.85)
        r[m3] = (gray[m3] - 0.65) / 0.20
        g[m3] = 1.0
        b[m3] = 0

        # Segment 4: 0.85 - 1.0 (yellow to red)
        m4 = gray >= 0.85
        r[m4] = 1.0
        g[m4] = 1.0 - (gray[m4] - 0.85) / 0.15
        b[m4] = 0

        rgb = np.stack([r, g, b], axis=-1)
        return np.clip(rgb * 255, 0, 255).astype(np.uint8)

    heatmap_color = apply_jet_colormap(heat_arr)

    # Alpha blend: 0.6 original + 0.4 heatmap for high visibility
    alpha = 0.4
    overlay = cv2_add_weighted(image_uint8, 1.0 - alpha, heatmap_color, alpha, 0)

    # Encode as base64 PNG
    buf = io.BytesIO()
    PILImage.fromarray(overlay).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def cv2_add_weighted(src1: np.ndarray, alpha: float, src2: np.ndarray, beta: float, gamma: float) -> np.ndarray:
    """Replicate cv2.addWeighted using numpy: dst = src1*alpha + src2*beta + gamma."""
    # Ensure both are float32 for computation
    dst = src1.astype(np.float32) * alpha + src2.astype(np.float32) * beta + gamma
    return np.clip(dst, 0, 255).astype(np.uint8)


def get_interpreter(model_id: str) -> Any:
    with _lock:
        interp = _interp_cache.get(model_id)
        if interp is not None:
            return interp
        path = model_registry.model_path(model_id)
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"model file missing: {path.name}")
        interp = _Interpreter(model_path=str(path))
        interp.allocate_tensors()
        _interp_cache[model_id] = interp
        return interp


def _preprocess(image: Image.Image, input_details: dict[str, Any]) -> np.ndarray:
    shape = tuple(int(v) for v in input_details["shape"])
    if len(shape) != 4:
        raise HTTPException(status_code=500, detail=f"unsupported input shape {shape}")
    # Normal models are NHWC; fall back to NCHW if the tensor says so.
    if shape[3] == 3 or shape[3] == 1:
        h, w, c = shape[1], shape[2], shape[3]
        nchw = False
    elif shape[1] == 3 or shape[1] == 1:
        c, h, w = shape[1], shape[2], shape[3]
        nchw = True
    else:
        raise HTTPException(status_code=500, detail=f"cannot interpret input shape {shape}")

    img = image.convert("RGB").resize((w, h))
    arr = np.asarray(img, dtype=np.float32)[:, :, :c]
    dtype = np.dtype(input_details["dtype"])
    if dtype == np.uint8:
        arr = np.clip(arr, 0, 255).astype(np.uint8)
    else:
        # MobileNetV2-style models expect [-1, 1]; confirmed empirically on
        # real labeled chest X-rays (see packages/ml IMAGE_PREPROCESSING).
        arr = arr / 127.5 - 1.0

    if nchw:
        arr = np.transpose(arr, (2, 0, 1))
    return arr.reshape(shape)


def _postprocess(output_tensor: np.ndarray, labels: list[str], model_id: str) -> dict[str, Any]:
    flat = np.asarray(output_tensor).flatten()
    
    # Handle binary classification with single sigmoid output (pneumonia probability)
    if flat.size == 1 and len(labels) == 2:
        pneumonia_prob = float(flat[0])
        normal_prob = 1.0 - pneumonia_prob
        scores = [normal_prob, pneumonia_prob]
    elif flat.size != len(labels):
        # Shape mismatch: keep the tensor details so we can reconcile the
        # TS manifest, but still emit a best-effort result.
        flat = flat[: len(labels)] if flat.size >= len(labels) else list(flat) + [0.0] * (len(labels) - flat.size)
        scores = list(map(float, flat))
        if any(v < 0 for v in scores) and all(abs(v) <= 1e6 for v in scores):
            scores = model_registry.softmax(scores)
    else:
        scores = list(map(float, flat))
        if any(v < 0 for v in scores) and all(abs(v) <= 1e6 for v in scores):
            scores = model_registry.softmax(scores)

    ranked = sorted(zip(labels, scores), key=lambda kv: kv[1], reverse=True)
    best_label, best_conf = ranked[0]
    return {
        "model": model_id,
        "label": best_label,
        "confidence": round(best_conf, 6),
        "scores": [
            {"label": label, "confidence": round(conf, 6)} for label, conf in ranked
        ],
        "tensor_details": {
            "output_shape": list(np.asarray(output_tensor).shape),
            "raw_first": [round(float(v), 6) for v in np.asarray(output_tensor).flatten()[:5]],
        },
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/models")
def list_models() -> dict[str, Any]:
    """Enumerate models with live details read from the .tflite files.

    This resolves input/output shapes that were unknown at extraction time.
    """
    out: dict[str, Any] = {}
    for model_id, spec in model_registry.MODELS.items():
        entry: dict[str, Any] = {
            "id": model_id,
            "file": spec["file"],
            "domain": spec["domain"],
            "labels": spec["labels"],
            "accuracy": spec["accuracy"],
            "disclaimer": spec["disclaimer"],
            "present": model_registry.model_path(model_id).exists(),
        }
        try:
            interp = get_interpreter(model_id)
            in_dt = interp.get_input_details()[0]
            out_dt = interp.get_output_details()[0]
            entry["input"] = {
                "name": in_dt["name"],
                "shape": [int(v) for v in in_dt["shape"]],
                "dtype": in_dt["dtype"].__name__,
                "quantization": _quant_summary(in_dt),
            }
            entry["output"] = {
                "name": out_dt["name"],
                "shape": [int(v) for v in out_dt["shape"]],
                "dtype": out_dt["dtype"].__name__,
            }
        except Exception as exc:  # noqa: BLE001
            entry["error"] = str(exc)
        out[model_id] = entry
    return {"models": out}


def _quant_summary(details: dict[str, Any]) -> str | None:
    q = details.get("quantization")
    if isinstance(q, tuple) and q:
        try:
            scale, zero = float(q[0]), int(q[1])
            return f"scale={scale}, zero_point={zero}"
        except (TypeError, ValueError):
            return None
    return None


@app.post("/predict")
def predict(
    file: UploadFile = File(...),
    model_id: str = Form("pneumonia"),
    generate_saliency: bool = Form(True),
) -> Any:
    # 1. Resolve the model and its domain. Unknown model -> 400.
    spec = model_registry.MODELS.get(model_id)
    if spec is None:
        raise HTTPException(status_code=400, detail=f"unknown model: {model_id}")
    model_domain = spec["domain"]

    raw = file.file.read()
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"invalid image: {exc}") from exc

    # 2. Validation gate - no model runs (and no prediction is produced) unless
    #    the image looks like a real medical scan of the expected body part.
    result_validation = validation.validate_image(image)

    if not result_validation["is_medical_scan"]:
        return JSONResponse(
            status_code=422,
            content={
                "status": "REJECTED",
                "code": "NOT_A_MEDICAL_IMAGE",
                "message": (
                    "This does not look like a chest X-ray or brain MRI. "
                    "No prediction was made."
                ),
                "input_analysis": result_validation,
            },
        )

    detected_domain = result_validation["detected_domain"]
    if detected_domain != "unknown" and detected_domain != model_domain:
        return JSONResponse(
            status_code=422,
            content={
                "status": "REJECTED",
                "code": "MODEL_IMAGE_MISMATCH",
                "message": (
                    f"This looks like a {detected_domain} image but the selected "
                    f"model is for {model_domain}. No prediction was made."
                ),
                "selected_model": model_id,
                "model_domain": model_domain,
                "detected_domain": detected_domain,
                "suggested_models": model_registry.models_for_domain(detected_domain),
                "input_analysis": result_validation,
            },
        )

    # 3. Only now run the real TFLite interpreter.
    interp = get_interpreter(model_id)
    input_details = interp.get_input_details()[0]
    output_details = interp.get_output_details()[0]

    try:
        tensor = _preprocess(image, input_details)
        interp.set_tensor(input_details["index"], tensor)
        interp.invoke()
        out = interp.get_tensor(output_details["index"])
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"inference failed: {exc}") from exc

    result = _postprocess(out, spec["labels"], model_id)
    result["status"] = "COMPLETED"
    result["input_shape"] = [int(v) for v in input_details["shape"]]
    result["input_dtype"] = input_details["dtype"].__name__
    result["preprocessing"] = "pixel / 127.5 - 1 ([-1,1])"
    result["accuracy"] = spec["accuracy"]
    result["disclaimer"] = spec["disclaimer"]
    result["model_domain"] = model_domain
    result["input_analysis"] = result_validation
    if detected_domain == "unknown":
        # Passed Stage A but the body part was ambiguous: still return the model
        # output, but flag it so the UI can warn the user.
        result["low_confidence_domain"] = True

    # 4. Generate dynamic saliency heatmap on the user's uploaded image
    if generate_saliency:
        try:
            # Prepare the original image as uint8 (224, 224, 3) for saliency generation
            # This matches what gen_saliency.py expects
            image_uint8 = np.asarray(
                image.convert("RGB").resize((SALIENCY_SIZE, SALIENCY_SIZE)),
                dtype=np.uint8
            )

            # Get top class index from result
            top_label = result["label"]
            top_class_idx = spec["labels"].index(top_label)

            saliency_b64 = _generate_saliency(
                interp, image_uint8, input_details, output_details, top_class_idx
            )
            result["saliency_base64"] = saliency_b64
            result["saliency_top_class"] = top_label
        except Exception as exc:  # noqa: BLE001
            # Saliency is best-effort; don't fail the prediction if it errors
            result["saliency_error"] = f"Saliency generation failed: {exc}"

    return result