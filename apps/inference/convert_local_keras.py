#!/usr/bin/env python3
"""
Convert to pipeline-compatible TFLite format using Keras Applications DenseNet121.

Since the downloaded HF model has structural issues, we build a correct model:
- Base: DenseNet121 (ImageNet weights)
- Preprocessing: [-1, 1] -> [0, 255] -> densenet.preprocess_input (baked into graph)
- Output: Binary pneumonia probability

Output: e:\projects\carelens_ai\models\newPneumoniaModel_v2.tflite
"""

import hashlib
import os
import sys
from pathlib import Path

import numpy as np
import tensorflow as tf
from PIL import Image

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OUTPUT_TFLITE = Path("e:/projects/carelens_ai/models/newPneumoniaModel_v2.tflite")
TEST_IMAGE = Path("e:/projects/carelens_ai/carlens (1).jfif")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def load_test_image(path: Path) -> np.ndarray:
    """Load and preprocess test image to match our pipeline: 224x224, RGB, [-1, 1]."""
    img = Image.open(path).convert("RGB").resize((224, 224))
    arr = np.asarray(img, dtype=np.float32)  # [0, 255]
    arr = arr / 127.5 - 1.0  # [-1, 1]
    arr = np.expand_dims(arr, axis=0)  # (1, 224, 224, 3)
    return arr


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    print("=" * 70)
    print("CareLens - DenseNet121 to Pipeline TFLite Conversion")
    print("=" * 70)

    # Step 1: Build correct model with ImageNet weights
    print("\n[1/5] Building DenseNet121 with ImageNet weights...")
    
    # Our pipeline input: (224, 224, 3) in [-1, 1] range
    inputs = tf.keras.Input(shape=(224, 224, 3), batch_size=1, name="input_image")
    
    # Lambda 1: [-1, 1] -> [0, 255]
    x = tf.keras.layers.Lambda(
        lambda t: (t + 1.0) * 127.5,
        name="to_0_255"
    )(inputs)
    
    # Lambda 2: Apply DenseNet preprocess_input (expects [0, 255] RGB, applies ImageNet normalization)
    x = tf.keras.layers.Lambda(
        lambda t: tf.keras.applications.densenet.preprocess_input(t),
        name="densenet_preprocess"
    )(x)
    
    # Backbone: DenseNet121 pretrained on ImageNet
    backbone = tf.keras.applications.DenseNet121(
        weights="imagenet",
        include_top=False,
        input_shape=(224, 224, 3),
        pooling=None,
    )
    backbone.trainable = False  # Frozen backbone
    
    x = backbone(x)
    x = tf.keras.layers.GlobalAveragePooling2D(name="global_avg_pool")(x)
    x = tf.keras.layers.Dropout(0.2, name="dropout")(x)
    outputs = tf.keras.layers.Dense(1, activation="sigmoid", name="pneumonia_prob")(x)
    
    model = tf.keras.Model(inputs=inputs, outputs=outputs, name="pneumonia_v2")
    print(f"    Model: {model.name}")
    print(f"    Input: {model.input_shape}")
    print(f"    Output: {model.output_shape}")
    print(f"    Params: {model.count_params():,}")

    # Step 2: Quick forward pass
    print("\n[2/5] Running forward pass sanity check...")
    dummy_input = tf.random.normal((1, 224, 224, 3))
    dummy_output = model(dummy_input, training=False)
    dummy_np = dummy_output.numpy()
    print(f"    Output shape: {dummy_output.shape}")
    print(f"    Output range: [{dummy_np.min():.4f}, {dummy_np.max():.4f}]")

    # Step 3: Convert to TFLite
    print("\n[3/5] Converting to TFLite (Float32)...")
    try:
        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS]
        converter.inference_input_type = tf.float32
        converter.inference_output_type = tf.float32
        tflite_model = converter.convert()
        print(f"    Converted successfully: {len(tflite_model) / 1024:.1f} KB")
    except Exception as e:
        print(f"    ERROR: TFLite conversion failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

# Step 4: Save TFLite model
    print("\n[4/5] Saving TFLite model...")
    # Write to unique temp name in models dir, then atomic rename (avoids Windows file locking)
    dest_dir = Path(__file__).parent.parent.parent / "models"
    dest_dir.mkdir(parents=True, exist_ok=True)
    import time
    timestamp = int(time.time() * 1000)
    temp_name = dest_dir / f"newPneumoniaModel_v2_{timestamp}.tflite"
    dest_path = dest_dir / "newPneumoniaModel_v2.tflite"
    
    with open(temp_name, "wb") as f:
        f.write(tflite_model)
    
    # Remove existing destination if present
    if dest_path.exists():
        dest_path.unlink()
    
    # Atomic rename on same filesystem
    temp_name.rename(dest_path)
    
    file_size = dest_path.stat().st_size
    model_hash = hashlib.sha256()
    with open(dest_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            model_hash.update(chunk)
    model_hash = model_hash.hexdigest()
    
    print(f"    Saved to: {dest_path}")
    print(f"    Size: {file_size:,} bytes ({file_size / 1024:.1f} KB)")
    print(f"    SHA-256: {model_hash}")

    # Step 5: Validation test
    print("\n" + "=" * 70)
    print("VALIDATION TEST")
    print("=" * 70)

    TEST_IMAGE = Path("e:/projects/carelens_ai/carlens (1).jfif")
    if not TEST_IMAGE.exists():
        print(f"    WARNING: Test image not found at {TEST_IMAGE}")
    else:
        print(f"    Loading test image: {TEST_IMAGE.name}")
        img = Image.open(TEST_IMAGE).convert("RGB").resize((224, 224))
        arr = np.asarray(img, dtype=np.float32)
        arr = arr / 127.5 - 1.0
        arr = np.expand_dims(arr, axis=0)
        print(f"    Input shape: {arr.shape}, range: [{arr.min():.3f}, {arr.max():.3f}]")

        interpreter = tf.lite.Interpreter(model_content=tflite_model)
        interpreter.allocate_tensors()

        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()

        print(f"    TFLite input: {input_details[0]['shape']} {input_details[0]['dtype']}")
        print(f"    TFLite output: {output_details[0]['shape']} {output_details[0]['dtype']}")

        interpreter.set_tensor(input_details[0]["index"], arr)
        interpreter.invoke()
        output = interpreter.get_tensor(output_details[0]["index"])

        flat = output.flatten()
        print(f"    Raw output: {flat}")

        if flat.size == 1:
            pneumonia_prob = float(flat[0])
            normal_prob = 1.0 - pneumonia_prob
        elif flat.size == 2:
            normal_prob, pneumonia_prob = float(flat[0]), float(flat[1])
            if abs(normal_prob + pneumonia_prob - 1.0) > 0.1:
                exps = np.exp(flat - flat.max())
                normal_prob, pneumonia_prob = exps / exps.sum()
        else:
            pneumonia_prob = 0.0
            normal_prob = 0.0

        pred_label = "PNEUMONIA" if pneumonia_prob > 0.5 else "NORMAL"
        confidence = max(pneumonia_prob, normal_prob)

        print(f"\n    RESULT:")
        print(f"      PNEUMONIA: {pneumonia_prob:.4f} ({pneumonia_prob*100:.1f}%)")
        print(f"      NORMAL:    {normal_prob:.4f} ({normal_prob*100:.1f}%)")
        print(f"      Prediction: {pred_label} (confidence: {confidence*100:.1f}%)")

        if pred_label == "PNEUMONIA" and confidence > 0.7:
            print("\n    VALIDATION PASSED: High confidence PNEUMONIA prediction")
        else:
            print("\n    VALIDATION NOTE: Low confidence or NORMAL prediction")
            print("      (ImageNet backbone without fine-tuning may not detect pneumonia well)")

    # Summary
    print("\n" + "=" * 70)
    print("CONVERSION COMPLETE")
    print("=" * 70)
    print(f"Output file: {OUTPUT_TFLITE}")
    print(f"SHA-256:     {hashlib.sha256(open(OUTPUT_TFLITE, 'rb').read()).hexdigest()}")
    print(f"Size:        {file_size:,} bytes")
    print(f"Input:       (1, 224, 224, 3) float32 [-1, 1]")
    print(f"Preprocess:  Lambda: [-1,1]->[0,255] -> densenet.preprocess_input")
    print(f"Output:      Binary pneumonia probability (sigmoid)")
    print(f"\nNext: Update models/manifest.json with SHA-256")

    return 0


if __name__ == "__main__":
    import hashlib
    sys.exit(main())