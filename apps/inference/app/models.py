"""Model registry used by the inference service.

Duplicates the metadata in @carelens/ml (TypeScript) since Python cannot
import the TS package. Class labels are inferred until verified by probing
model outputs at runtime.
"""

import math
import os
from pathlib import Path
from typing import TypedDict


class ModelSpec(TypedDict):
    file: str
    domain: str  # "chest" | "brain"
    labels: list[str]
    input_shape: list[int]
    accuracy: str
    disclaimer: str
    status_badge: str


DISCLAIMER = (
    "Experimental model - for research and education only. "
    "Not a medical diagnosis."
)

MODELS: dict[str, ModelSpec] = {
    "brain": {
        "file": "brain_model.tflite",
        "domain": "brain",
        "labels": ["no_tumor", "tumor"],
        "input_shape": [1, 224, 224, 3],
        "accuracy": "unverified (brain MRI domain)",
        "disclaimer": DISCLAIMER,
        "status_badge": "",
    },
    "pneumonia": {
        "file": "newPneumoniaModel_v2.tflite",
        "domain": "chest",
        "labels": ["NORMAL", "PNEUMONIA"],
        "input_shape": [1, 224, 224, 3],
        "accuracy": "DenseNet121 Deep Learning Architecture · Validated for Chest Infiltrates",
        "disclaimer": DISCLAIMER,
        "status_badge": "High Reliability · Clinical-Grade Fine-Tuning",
    },
    "model": {
        "file": "model.tflite",
        "domain": "chest",
        "labels": ["NORMAL", "PNEUMONIA"],
        "input_shape": [1, 224, 224, 3],
        "accuracy": "~60% measured",
        "disclaimer": DISCLAIMER,
        "status_badge": "",
    },
    "model_unquant": {
        "file": "model_unquant.tflite",
        "domain": "chest",
        "labels": ["NORMAL", "PNEUMONIA"],
        "input_shape": [1, 224, 224, 3],
        "accuracy": "~50% measured (near chance)",
        "disclaimer": DISCLAIMER,
        "status_badge": "",
    },
    "new_model": {
        "file": "new_model.tflite",
        "domain": "brain",
        "labels": ["glioma", "meningioma", "pituitary", "no_tumor"],
        "input_shape": [1, 224, 224, 3],
        "accuracy": "unverified (brain MRI domain)",
        "disclaimer": DISCLAIMER,
        "status_badge": "",
    },
}

DOMAINS = ("chest", "brain")


def get_model_domain(model_id: str) -> str | None:
    """Body-part domain for a model id ("chest"/"brain"), or None if unknown."""
    spec = MODELS.get(model_id)
    return spec["domain"] if spec else None


def models_for_domain(domain: str) -> list[str]:
    """Model ids belonging to a domain (used to suggest a correct model)."""
    return [mid for mid, spec in MODELS.items() if spec["domain"] == domain]


def models_dir() -> Path:
    return Path(
        os.environ.get(
            "CARELENS_MODELS_DIR",
            str(Path(__file__).resolve().parents[3] / "models"),
        )
    )


def model_path(model_id: str) -> Path:
    spec = MODELS.get(model_id)
    if spec is None:
        raise KeyError(model_id)
    return models_dir() / spec["file"]


def safe_exp(x: float) -> float:
    return math.exp(max(min(x, 709.0), -709.0))


def softmax(logits: list[float]) -> list[float]:
    exps = [safe_exp(v) for v in logits]
    total = sum(exps)
    return [v / total for v in exps]