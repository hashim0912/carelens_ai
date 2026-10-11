"""Anti-hardcode tests.

These prove that every reported label/confidence/score comes from the real
TFLite interpreter output for the uploaded image, and that the interpreter is
never invoked for rejected images.
"""

from __future__ import annotations

import numpy as np
import pytest

from app import main as main_module


def _post(client, image: bytes, model_id: str, *, jpeg: bool = False):
    content_type = "image/jpeg" if jpeg else "image/png"
    filename = "image.jpg" if jpeg else "image.png"
    return client.post(
        "/predict",
        files={"file": (filename, image, content_type)},
        data={"model_id": model_id},
    )


def test_two_different_images_produce_different_scores(client, chest_xray_1, chest_xray_2):
    first = _post(client, chest_xray_1, "model", jpeg=True).json()
    second = _post(client, chest_xray_2, "model", jpeg=True).json()
    a = [s["confidence"] for s in first["scores"]]
    b = [s["confidence"] for s in second["scores"]]
    # If results were hardcoded/cached, two distinct images would match exactly.
    assert any(abs(x - y) > 1e-6 for x, y in zip(a, b)), (a, b)


def test_response_reflects_interpreter_output_exactly(client, chest_xray_1, monkeypatch):
    """The API output must be a pure function of the interpreter tensor."""

    known = np.array([[0.10, 0.20, 0.70]], dtype=np.float32)

    class FakeInterpreter:
        def get_input_details(self):
            return [
                {
                    "index": 0,
                    "shape": np.array([1, 224, 224, 3]),
                    "dtype": np.float32,
                    "name": "input",
                    "quantization": (0.0, 0),
                }
            ]

        def get_output_details(self):
            return [
                {
                    "index": 1,
                    "shape": np.array([1, 3]),
                    "dtype": np.float32,
                    "name": "output",
                }
            ]

        def set_tensor(self, index, tensor):  # noqa: ARG002
            self._set = tensor

        def invoke(self):
            return None

        def get_tensor(self, index):  # noqa: ARG002
            return known

    monkeypatch.setattr(main_module, "get_interpreter", lambda _mid: FakeInterpreter())

    res = _post(client, chest_xray_1, "pneumonia", jpeg=True)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["label"] == "VIRAL_PNEUMONIA"
    assert body["confidence"] == pytest.approx(0.70, abs=1e-6)
    by_label = {s["label"]: s["confidence"] for s in body["scores"]}
    assert by_label["NORMAL"] == pytest.approx(0.10, abs=1e-6)
    assert by_label["BACTERIAL_PNEUMONIA"] == pytest.approx(0.20, abs=1e-6)
    assert by_label["VIRAL_PNEUMONIA"] == pytest.approx(0.70, abs=1e-6)


def _explode(_mid):  # pragma: no cover - must never be called
    raise AssertionError("interpreter must NOT be invoked for a rejected image")


def test_interpreter_not_run_for_non_medical_image(client, color_photo, monkeypatch):
    monkeypatch.setattr(main_module, "get_interpreter", _explode)
    res = _post(client, color_photo, "pneumonia")
    assert res.status_code == 422, res.text
    assert res.json()["code"] == "NOT_A_MEDICAL_IMAGE"


def test_interpreter_not_run_for_domain_mismatch(client, chest_xray_1, monkeypatch):
    monkeypatch.setattr(main_module, "get_interpreter", _explode)
    res = _post(client, chest_xray_1, "brain", jpeg=True)
    assert res.status_code == 422, res.text
    assert res.json()["code"] == "MODEL_IMAGE_MISMATCH"
