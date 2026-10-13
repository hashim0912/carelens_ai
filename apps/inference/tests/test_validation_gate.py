"""Validation gate + `/predict` behaviour tests.

These exercise the real inference service with the real `.tflite` models and
real sample chest X-ray / brain MRI images vendored under ``tests/fixtures``.
"""

from __future__ import annotations

import pytest


def _post(client, image: bytes, model_id: str, *, jpeg: bool = False):
    content_type = "image/jpeg" if jpeg else "image/png"
    filename = "image.jpg" if jpeg else "image.png"
    return client.post(
        "/predict",
        files={"file": (filename, image, content_type)},
        data={"model_id": model_id},
    )


def test_chest_xray_chest_model_succeeds(client, chest_xray_1):
    res = _post(client, chest_xray_1, "pneumonia", jpeg=True)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "COMPLETED"
    assert body["model_domain"] == "chest"
    assert body["input_analysis"]["is_medical_scan"] is True
    assert body["input_analysis"]["detected_domain"] == "chest"
    # Real model output: binary labels NORMAL / PNEUMONIA
    assert body["label"] in ["NORMAL", "PNEUMONIA"]
    assert len(body["scores"]) == 2
    total = sum(s["confidence"] for s in body["scores"])
    assert 0.9 <= total <= 1.1, total
    assert body["confidence"] == max(s["confidence"] for s in body["scores"])


def test_chest_xray_with_brain_model_is_rejected(client, chest_xray_1):
    res = _post(client, chest_xray_1, "brain", jpeg=True)
    assert res.status_code == 422, res.text
    body = res.json()
    assert body["status"] == "REJECTED"
    assert body["code"] == "MODEL_IMAGE_MISMATCH"
    assert body["detected_domain"] == "chest"
    assert body["model_domain"] == "brain"
    assert body["selected_model"] == "brain"
    assert set(body["suggested_models"]) >= {"pneumonia", "model", "model_unquant"}
    # No prediction fields may be present.
    for key in ("label", "confidence", "scores"):
        assert key not in body


def test_brain_mri_with_chest_model_is_rejected(client, brain_mri_1):
    res = _post(client, brain_mri_1, "model", jpeg=True)
    assert res.status_code == 422, res.text
    body = res.json()
    assert body["code"] == "MODEL_IMAGE_MISMATCH"
    assert body["detected_domain"] == "brain"
    assert body["model_domain"] == "chest"
    assert set(body["suggested_models"]) >= {"brain", "new_model"}
    for key in ("label", "confidence", "scores"):
        assert key not in body


def test_brain_mri_with_brain_model_succeeds(client, brain_mri_1):
    res = _post(client, brain_mri_1, "brain", jpeg=True)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "COMPLETED"
    assert body["model_domain"] == "brain"
    assert body["label"] in ["no_tumor", "tumor"]


def test_color_photo_is_rejected(client, color_photo):
    res = _post(client, color_photo, "pneumonia")
    assert res.status_code == 422, res.text
    body = res.json()
    assert body["status"] == "REJECTED"
    assert body["code"] == "NOT_A_MEDICAL_IMAGE"
    assert body["input_analysis"]["is_medical_scan"] is False
    for key in ("label", "confidence", "scores"):
        assert key not in body


@pytest.mark.parametrize(
    "key",
    [
        "grayscale_photo",
        "grayscale_photo_smooth",
        "scanned_text_document",
        "grayscale_screenshot",
        "plain_gradient",
        "noise",
    ],
)
def test_grayscale_non_medical_images_are_rejected(
    client, grayscale_negatives, key
):
    res = _post(client, grayscale_negatives[key], "pneumonia")
    assert res.status_code == 422, f"{key}: {res.text}"
    body = res.json()
    assert body["code"] == "NOT_A_MEDICAL_IMAGE", key
    assert body["input_analysis"]["is_medical_scan"] is False
    assert body["input_analysis"]["reasons"], key


def test_unknown_model_returns_400(client, chest_xray_1):
    res = _post(client, chest_xray_1, "does_not_exist", jpeg=True)
    assert res.status_code == 400


def test_models_endpoint_exposes_domain(client):
    res = client.get("/models")
    assert res.status_code == 200
    models = res.json()["models"]
    assert models["pneumonia"]["domain"] == "chest"
    assert models["model"]["domain"] == "chest"
    assert models["model_unquant"]["domain"] == "chest"
    assert models["brain"]["domain"] == "brain"
    assert models["new_model"]["domain"] == "brain"
