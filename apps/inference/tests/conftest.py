"""Make the inference package importable and provide shared test fixtures."""

from __future__ import annotations

import io
import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

INFERENCE_DIR = Path(__file__).resolve().parents[1]
if str(INFERENCE_DIR) not in sys.path:
    sys.path.insert(0, str(INFERENCE_DIR))

from app.main import app  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="session")
def chest_xray_1() -> bytes:
    return (FIXTURES / "chest_xray_1.jfif").read_bytes()


@pytest.fixture(scope="session")
def chest_xray_2() -> bytes:
    return (FIXTURES / "chest_xray_2.jfif").read_bytes()


@pytest.fixture(scope="session")
def brain_mri_1() -> bytes:
    return (FIXTURES / "brain_mri_1.jfif").read_bytes()


# ---------------------------------------------------------------------------
# Programmatically generated non-medical images
# ---------------------------------------------------------------------------


def _png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _gradient() -> Image.Image:
    x = np.linspace(0, 255, 224)[None, :].repeat(224, 0)
    return Image.fromarray(x.astype(np.uint8), "L")


def _noise(seed: int = 1) -> Image.Image:
    rng = np.random.default_rng(seed)
    return Image.fromarray(rng.integers(0, 256, (224, 224), dtype=np.uint8), "L")


def _text_document() -> Image.Image:
    img = Image.new("RGB", (800, 1000), (250, 250, 250))
    draw = ImageDraw.Draw(img)
    rng = np.random.default_rng(2)
    y = 60
    while y < 940:
        x = 80
        while x < 720:
            width = int(rng.integers(20, 90))
            draw.rectangle([x, y, min(x + width, 720), y + 8], fill=(20, 20, 20))
            x += width + 12
        y += 26
    return img


def _screenshot() -> Image.Image:
    img = Image.new("RGB", (1280, 720), (30, 30, 34))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, 1280, 40], fill=(45, 45, 50))
    draw.rectangle([0, 40, 260, 720], fill=(38, 38, 42))
    rng = np.random.default_rng(3)
    for i in range(40):
        y = 70 + i * 16
        x = 20
        while x < 1240:
            width = int(rng.integers(10, 120))
            draw.rectangle(
                [x, y, x + width, y + 7],
                fill=tuple(int(v) for v in rng.integers(90, 230, 3)),
            )
            x += width + 10
    return img


def _gray_photo(seed: int = 4) -> Image.Image:
    rng = np.random.default_rng(seed)
    small = rng.random((14, 14))
    base = np.asarray(
        Image.fromarray((small * 255).astype(np.uint8)).resize(
            (224, 224), Image.BICUBIC
        ),
        dtype=np.float64,
    )
    texture = rng.normal(0, 12, (224, 224))
    gray = np.clip(base * 0.6 + 60 + texture, 0, 255)
    return Image.fromarray(gray.astype(np.uint8), "L")


def _gray_photo_smooth(seed: int = 5) -> Image.Image:
    rng = np.random.default_rng(seed)
    small = rng.random((20, 20, 3))
    base = np.asarray(
        Image.fromarray((small * 255).astype(np.uint8)).resize((256, 256), Image.BICUBIC)
    )
    return Image.fromarray(base).convert("L")


@pytest.fixture(scope="session")
def color_photo() -> bytes:
    """A colourful screenshot-like image (non-medical)."""
    return _png_bytes(_screenshot())


@pytest.fixture(scope="session")
def grayscale_negatives() -> dict[str, bytes]:
    """Grayscale images that must NOT be accepted as medical scans."""
    return {
        "grayscale_photo": _png_bytes(_gray_photo()),
        "grayscale_photo_smooth": _png_bytes(_gray_photo_smooth()),
        "scanned_text_document": _png_bytes(_text_document()),
        "grayscale_screenshot": _png_bytes(_screenshot().convert("L")),
        "plain_gradient": _png_bytes(_gradient()),
        "noise": _png_bytes(_noise()),
    }
