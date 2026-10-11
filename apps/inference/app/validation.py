"""Medical-image validation gate for the inference service.

Two responsibilities:

* **Stage A - is this a medical scan at all?** Reject colour photos, UI
  screenshots, documents, plain gradients, noise and other non-medical inputs so
  the model never returns a confident bogus verdict.
* **Stage B - which body part?** Classify the scan as ``chest`` (X-ray) or
  ``brain`` (MRI) from measurable image features, so a chest model cannot be run
  on a brain image and vice-versa.

The gate is heuristic by design (fast, dependency-light, explainable). All
thresholds are named constants measured on real sample images plus a set of
programmatically generated negatives; the measured feature table is reproduced
below. A learned gate model can replace the heuristics: if ``models/gate_model.tflite``
exists it is executed first (see :func:`_try_gate_model`) and takes precedence.

Measured features (real samples and generated negatives)
--------------------------------------------------------
=================  ======  =====  =====  =====  ======  ======  =====  =====  ====
sample             color   dark   white  std    lapvar  rough   edge   flat   lvls
=================  ======  =====  =====  =====  ======  ======  =====  =====  ====
chest X-ray        0.0     0.03   0.00   55.1   56.1    0.049   0.003  0.58   256
brain MRI          0.0     0.62   0.05   76.4   486.3   0.075   0.106  0.59   256
chest X-ray #2     0.0     0.02   0.03   55.7   92.3    0.039   0.006  0.70   255
gradient           0.0     0.18   0.08   73.9   0.3     0.008   0.000  1.00   224
noise              0.0     0.17   0.08   74.1   110333  1.158   0.942  0.00   256
text document      0.0     0.21   0.79   93.1   5873.4  0.066   0.106  0.89   2
screenshot         28.8    --     --     --     --      --      --     --     125
grayscale photo A  0.0     0.00   0.00   36.8   2888.9  0.377   0.572  0.00   216
grayscale photo B  0.0     0.03   0.00   40.6   5.7     0.099   0.000  0.25   243
=================  ======  =====  =====  =====  ======  ======  =====  =====  ====
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------
# Thresholds (named constants; see measured table above)
# ---------------------------------------------------------------------------

# Stage A - medical-scan plausibility
MIN_SIDE = 96  # px; anything smaller cannot be a diagnostic scan
MIN_ASPECT = 0.5  # w/h; rejects extreme panoramas / strip images
MAX_ASPECT = 1.6  # w/h; screenshots (16:9 = 1.78) are wider than scans
MAX_COLORFULNESS = 8.0  # mean channel spread; scans are ~0
MAX_COLORED_FRACTION = 0.05  # fraction of clearly coloured pixels
MAX_WHITE_FRACTION = 0.30  # documents are mostly near-white
MIN_LAPLACIAN_VARIANCE = 15.0  # plain gradients are ~0
MAX_NEIGHBOR_ROUGHNESS = 0.30  # noise is ~1.1, scans ~0.05
MAX_EDGE_DENSITY = 0.45  # dense edges (noise/text) indicate non-scan content
MIN_UNIQUE_LEVELS = 180  # UI screenshots use a limited palette (~125)
MAX_FLAT_FRACTION = 0.85  # UI panels are a large fraction perfectly flat
MAX_FLAT_ENTROPY = 6.0  # combined with the above
MIN_STD = 10.0  # essentially blank image

# Stage B - domain detection
BRAIN_MIN_DARK = 0.35  # MRI background is mostly black
BRAIN_MIN_CENTER_RATIO = 1.3  # brain tissue is a bright object in the centre
BRAIN_MAX_ENTROPY = 6.5  # MRIs use a narrower tonal range than radiographs
CHEST_MAX_DARK = 0.20  # chest X-rays fill the frame with little pure black
CHEST_MIN_ENTROPY = 6.0  # radiographs spread across the full tonal range

_LAPLACIAN_EDGE_MAG = 30  # |Laplacian| above this counts as an edge pixel
_DARK_LEVEL = 45
_BRIGHT_LEVEL = 210
_WHITE_LEVEL = 235

# ---------------------------------------------------------------------------
# Optional learned gate model hook
# ---------------------------------------------------------------------------

GATE_MODEL_FILENAME = "gate_model.tflite"
GATE_MODEL_LABELS = ["chest_xray", "brain_mri", "other"]
_gate_interp: Any | None = None
_gate_loaded = False


def _gate_model_path() -> Path:
    from . import models as model_registry

    return model_registry.models_dir() / GATE_MODEL_FILENAME


def _try_gate_model(image: Image.Image, metrics: dict[str, Any]) -> dict[str, Any] | None:
    """Run the optional learned gate model if ``models/gate_model.tflite`` exists.

    The file is **not** shipped; this hook only supports loading it so a future
    trained gate can take precedence over the heuristics. Returns ``None`` when
    the file is absent or cannot be executed, in which case the caller falls
    back to the heuristics.
    """
    global _gate_interp, _gate_loaded

    path = _gate_model_path()
    if not path.exists():
        return None

    if not _gate_loaded:
        _gate_loaded = True
        try:  # kept lazy so the module imports even without a TFLite runtime
            try:
                from ai_edge_litert.interpreter import Interpreter as _Interp
            except ImportError:
                from tflite_runtime.interpreter import Interpreter as _Interp  # type: ignore

            interp = _Interp(model_path=str(path))
            interp.allocate_tensors()
            _gate_interp = interp
        except Exception:  # noqa: BLE001 - any failure falls back to heuristics
            _gate_interp = None

    if _gate_interp is None:
        return None

    try:
        in_dt = _gate_interp.get_input_details()[0]
        out_dt = _gate_interp.get_output_details()[0]
        shape = tuple(int(v) for v in in_dt["shape"])
        h, w = shape[1], shape[2]
        arr = np.asarray(image.convert("RGB").resize((w, h)), dtype=np.float32) / 255.0
        _gate_interp.set_tensor(in_dt["index"], arr.reshape(shape))
        _gate_interp.invoke()
        probs = np.asarray(_gate_interp.get_tensor(out_dt["index"])).flatten().tolist()
    except Exception:  # noqa: BLE001
        return None

    if len(probs) != len(GATE_MODEL_LABELS):
        return None
    idx = int(np.argmax(probs))
    label = GATE_MODEL_LABELS[idx]
    if label == "other":
        return {
            "is_medical_scan": False,
            "detected_domain": "unknown",
            "confidence": round(float(probs[idx]), 4),
            "reasons": ["Gate model classified the image as 'other' (not medical)."],
            "metrics": metrics,
        }
    return {
        "is_medical_scan": True,
        "detected_domain": "chest" if label == "chest_xray" else "brain",
        "confidence": round(float(probs[idx]), 4),
        "reasons": [],
        "metrics": metrics,
    }


# ---------------------------------------------------------------------------
# Feature extraction
# ---------------------------------------------------------------------------


def _box_std(gray: np.ndarray, k: int = 3) -> np.ndarray:
    """Local standard deviation with a k x k box, via integral images."""
    h, w = gray.shape
    pad = k // 2
    gp = np.pad(gray, pad, mode="edge").astype(np.float64)
    H, W = gp.shape
    ii = np.pad(gp.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    ii2 = np.pad((gp * gp).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    n = k * k
    S = ii[k:, k:] - ii[:-k, k:] - ii[k:, :-k] + ii[:-k, :-k]
    S2 = ii2[k:, k:] - ii2[:-k, k:] - ii2[k:, :-k] + ii2[:-k, :-k]
    mean = S / n
    var = np.clip(S2 / n - mean * mean, 0, None)
    return np.sqrt(var)[:h, :w]


def compute_metrics(image: Image.Image) -> tuple[dict[str, Any], np.ndarray, np.ndarray]:
    """Return ``(metrics, gray, rgb)`` for an image (all features are cheap)."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    gray = np.asarray(image.convert("L"), dtype=np.float64)
    h, w = gray.shape
    n = max(1, h * w)

    spread = rgb.max(axis=2) - rgb.min(axis=2)
    colorfulness = float(spread.mean())
    colored_fraction = float(np.mean(spread > 24))

    hist, _ = np.histogram(gray, bins=256, range=(0, 255))
    p = hist / max(1, hist.sum())
    nz = p[p > 0]
    entropy = float(-(nz * np.log2(nz)).sum())
    unique_levels = int(nz.size)

    dark_fraction = float(np.mean(gray < _DARK_LEVEL))
    bright_fraction = float(np.mean(gray > _BRIGHT_LEVEL))
    white_fraction = float(np.mean(gray > _WHITE_LEVEL))
    mean = float(gray.mean())
    std = float(gray.std())

    if h >= 3 and w >= 3:
        lap = np.zeros_like(gray)
        lap[1:-1, 1:-1] = (
            4 * gray[1:-1, 1:-1]
            - gray[:-2, 1:-1]
            - gray[2:, 1:-1]
            - gray[1:-1, :-2]
            - gray[1:-1, 2:]
        )
        lap_c = lap[1:-1, 1:-1]
        laplacian_variance = float(lap_c.var())
        edge_density = float(np.mean(np.abs(lap_c) > _LAPLACIAN_EDGE_MAG))
    else:
        laplacian_variance = 0.0
        edge_density = 0.0

    dx = float(np.abs(np.diff(gray, axis=1)).mean()) if w > 1 else 0.0
    dy = float(np.abs(np.diff(gray, axis=0)).mean()) if h > 1 else 0.0
    neighbor_roughness = (dx + dy) / (2 * std + 1e-6)

    box_std = _box_std(gray, 3)
    flat_fraction = float(np.mean(box_std < 3))

    cy0, cy1 = int(h * 0.3), int(h * 0.7)
    cx0, cx1 = int(w * 0.3), int(w * 0.7)
    center_mean = float(gray[cy0:cy1, cx0:cx1].mean()) if cy1 > cy0 and cx1 > cx0 else mean
    center_to_mean = center_mean / (mean + 1e-6)

    half = w // 2
    if half >= 1:
        left = gray[:, :half]
        right = gray[:, w - half:][:, ::-1]
        symmetry = float(np.abs(left - right).mean() / 255.0)
    else:
        symmetry = 0.0

    metrics: dict[str, Any] = {
        "width": int(w),
        "height": int(h),
        "aspect": round(w / h, 3) if h else 0.0,
        "colorfulness": round(colorfulness, 3),
        "colored_pixel_fraction": round(colored_fraction, 4),
        "mean": round(mean, 1),
        "std": round(std, 1),
        "dark_fraction": round(dark_fraction, 4),
        "bright_fraction": round(bright_fraction, 4),
        "white_fraction": round(white_fraction, 4),
        "histogram_entropy": round(entropy, 2),
        "unique_levels": unique_levels,
        "laplacian_variance": round(laplacian_variance, 1),
        "edge_density": round(edge_density, 4),
        "neighbor_roughness": round(neighbor_roughness, 3),
        "flat_fraction": round(flat_fraction, 3),
        "center_to_mean": round(center_to_mean, 3),
        "symmetry": round(symmetry, 3),
    }
    return metrics, gray, rgb


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def validate_image(image: Image.Image) -> dict[str, Any]:
    """Validate an uploaded image before any model runs.

    Returns a dict with ``is_medical_scan``, ``detected_domain`` (``chest`` /
    ``brain`` / ``unknown``), ``confidence``, ``reasons`` and ``metrics``.
    """
    metrics, _gray, _rgb = compute_metrics(image)

    # A trained gate model, if present, takes precedence over the heuristics.
    gate = _try_gate_model(image, metrics)
    if gate is not None:
        return gate

    reasons: list[str] = []
    w = metrics["width"]
    h = metrics["height"]
    aspect = metrics["aspect"]

    if w < MIN_SIDE or h < MIN_SIDE:
        reasons.append("Image is too small to be a diagnostic scan.")
    if aspect < MIN_ASPECT or aspect > MAX_ASPECT:
        reasons.append("Unusual aspect ratio (typical of screenshots, not scans).")
    if (
        metrics["colorfulness"] >= MAX_COLORFULNESS
        or metrics["colored_pixel_fraction"] >= MAX_COLORED_FRACTION
    ):
        reasons.append("Colour image: medical scans (X-ray/MRI) are grayscale.")
    if metrics["white_fraction"] >= MAX_WHITE_FRACTION:
        reasons.append("Mostly white: looks like a document, not a scan.")
    if metrics["laplacian_variance"] < MIN_LAPLACIAN_VARIANCE:
        reasons.append("Almost no texture detail: looks uniform/synthetic.")
    if (
        metrics["neighbor_roughness"] >= MAX_NEIGHBOR_ROUGHNESS
        or metrics["edge_density"] >= MAX_EDGE_DENSITY
    ):
        reasons.append("High-frequency noise or dense edges: not a natural scan.")
    if metrics["unique_levels"] < MIN_UNIQUE_LEVELS:
        reasons.append("Limited tonal palette: looks like a UI screenshot.")
    if (
        metrics["flat_fraction"] >= MAX_FLAT_FRACTION
        and metrics["histogram_entropy"] <= MAX_FLAT_ENTROPY
    ):
        reasons.append("Large flat UI-style regions: not a scan.")
    if metrics["std"] < MIN_STD:
        reasons.append("Almost blank / no contrast.")

    is_medical = len(reasons) == 0
    detected_domain = "unknown"
    confidence = 0.0

    if is_medical:
        if (
            metrics["dark_fraction"] >= BRAIN_MIN_DARK
            and metrics["center_to_mean"] >= BRAIN_MIN_CENTER_RATIO
            and metrics["histogram_entropy"] <= BRAIN_MAX_ENTROPY
        ):
            detected_domain = "brain"
            confidence = min(
                1.0,
                0.5
                + 0.25 * min(1.0, metrics["dark_fraction"] / 0.6)
                + 0.25 * min(1.0, (metrics["center_to_mean"] - 1.0) / 1.0),
            )
        elif (
            metrics["dark_fraction"] <= CHEST_MAX_DARK
            and metrics["histogram_entropy"] >= CHEST_MIN_ENTROPY
        ):
            detected_domain = "chest"
            confidence = min(
                1.0,
                0.5
                + 0.25
                * min(
                    1.0,
                    (CHEST_MAX_DARK - metrics["dark_fraction"]) / CHEST_MAX_DARK,
                )
                + 0.25
                * min(1.0, (metrics["histogram_entropy"] - CHEST_MIN_ENTROPY) / 2),
            )

    return {
        "is_medical_scan": is_medical,
        "detected_domain": detected_domain,
        "confidence": round(confidence, 3),
        "reasons": reasons,
        "metrics": metrics,
    }
