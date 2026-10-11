"""CareLens inference service.

Runs the extracted .tflite models. Serves predictions to the web app and is
the reference implementation that also lets us confirm each model's real
input/output tensor shapes (resolving the P0 manifest gaps).
"""

from __future__ import annotations

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
    if flat.size != len(labels):
        # Shape mismatch: keep the tensor details so we can reconcile the
        # TS manifest, but still emit a best-effort result.
        flat = flat[: len(labels)] if flat.size >= len(labels) else list(flat) + [0.0] * (len(labels) - flat.size)
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
    return result