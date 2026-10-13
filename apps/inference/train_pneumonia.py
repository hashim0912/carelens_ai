#!/usr/bin/env python3
"""
Fine-tune DenseNet121 for pneumonia detection on Chest X-Ray dataset.

Usage:
1. Download dataset: https://www.kaggle.com/datasets/paultimothymooney/chest-xray-pneumonia
2. Extract to ./data/chest_xray/ with structure:
   data/chest_xray/
   ├── train/
   │   ├── NORMAL/
   │   └── PNEUMONIA/
   ├── val/
   │   ├── NORMAL/
   │   └── PNEUMONIA/
   └── test/
       ├── NORMAL/
       └── PNEUMONIA/

3. Run: python train_pneumonia.py

Output: models/newPneumoniaModel_v2.tflite (Float32) + SHA-256
"""

import hashlib
import os
import sys
from pathlib import Path

import numpy as np
import tensorflow as tf
from tensorflow import keras

# ---------------------------------------------------------------------------
# GPU Setup (RTX 3060)
# ---------------------------------------------------------------------------

def setup_gpu():
    """Enable memory growth to avoid OOM on RTX 3060 (12GB VRAM)."""
    gpus = tf.config.experimental.list_physical_devices('GPU')
    if gpus:
        try:
            for gpu in gpus:
                tf.config.experimental.set_memory_growth(gpu, True)
            print(f"GPU memory growth enabled for {len(gpus)} GPU(s)")
        except RuntimeError as e:
            print(f"GPU setup warning: {e}")
    else:
        print("No GPU found, using CPU")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Data paths
DATA_ROOT = Path(__file__).resolve().parent.parent / "data" / "chest_xray"
TRAIN_DIR = DATA_ROOT / "train"
VAL_DIR = DATA_ROOT / "val"
TEST_DIR = DATA_ROOT / "test"

# Model paths
MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
OUTPUT_TFLITE = MODEL_DIR / "newPneumoniaModel_v2.tflite"

# Training config
IMG_SIZE = (224, 224)
BATCH_SIZE = 16
EPOCHS_HEAD = 5
EPOCHS_FINETUNE = 0  # Set >0 to fine-tune backbone after head training
LEARNING_RATE_HEAD = 1e-3
LEARNING_RATE_FINETUNE = 1e-5
SEED = 42

# ImageNet normalization constants
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


# ---------------------------------------------------------------------------
# Preprocessing Lambda (matches our inference pipeline exactly)
# ---------------------------------------------------------------------------

def get_preprocessing_layer():
    """
    Returns a Lambda layer that converts our pipeline input [-1, 1]
    to ImageNet-normalized [0, 1] -> (x - mean)/std.
    
    This is baked INTO the model graph so TFLite handles it natively.
    """
    def preprocess_fn(x):
        # x is in [-1, 1] from our pipeline (pixel / 127.5 - 1.0)
        # Step 1: [-1, 1] -> [0, 1]
        x = (x + 1.0) / 2.0
        # Step 2: [0, 1] -> ImageNet normalization
        x = (x - IMAGENET_MEAN) / IMAGENET_STD
        return x
    
    return keras.layers.Lambda(preprocess_fn, name="imagenet_preprocessing")


# ---------------------------------------------------------------------------
# Model Architecture
# ---------------------------------------------------------------------------

def build_model():
    """
    Build DenseNet121 with ImageNet backbone + custom head.
    Includes preprocessing Lambda so TFLite contains the full pipeline.
    """
    print("Building DenseNet121 model...")
    
    # Input matches our inference pipeline: (224, 224, 3) in [-1, 1] range
    inputs = keras.Input(shape=(224, 224, 3), batch_size=1, name="input_image")
    
    # Preprocessing baked into graph
    x = get_preprocessing_layer()(inputs)
    
    # Backbone: DenseNet121 pretrained on ImageNet
    backbone = keras.applications.DenseNet121(
        weights="imagenet",
        include_top=False,
        input_shape=(224, 224, 3),
        pooling=None,
    )
    backbone.trainable = False  # Freeze for head training
    
    x = backbone(x)
    x = keras.layers.GlobalAveragePooling2D(name="global_avg_pool")(x)
    x = keras.layers.Dropout(0.2, name="dropout")(x)
    outputs = keras.layers.Dense(1, activation="sigmoid", name="pneumonia_prob")(x)
    
    model = keras.Model(inputs=inputs, outputs=outputs, name="pneumonia_classifier")
    return model, backbone


# ---------------------------------------------------------------------------
# Data Loading
# ---------------------------------------------------------------------------

def load_datasets():
    """Load train/val/test datasets from directory structure."""
    print(f"Loading datasets from {DATA_ROOT}...")
    
    if not TRAIN_DIR.exists():
        raise FileNotFoundError(
            f"Training directory not found: {TRAIN_DIR}\n"
            f"Expected structure:\n"
            f"  {DATA_ROOT}/\n"
            f"  ├── train/NORMAL/\n"
            f"  ├── train/PNEUMONIA/\n"
            f"  ├── val/NORMAL/\n"
            f"  ├── val/PNEUMONIA/\n"
            f"  ├── test/NORMAL/\n"
            f"  └── test/PNEUMONIA/"
        )
    
    train_ds = keras.utils.image_dataset_from_directory(
        TRAIN_DIR,
        labels="inferred",
        label_mode="binary",
        class_names=["NORMAL", "PNEUMONIA"],
        color_mode="rgb",
        batch_size=BATCH_SIZE,
        image_size=IMG_SIZE,
        shuffle=True,
        seed=SEED,
        interpolation="bilinear",
    )
    
    val_ds = keras.utils.image_dataset_from_directory(
        VAL_DIR,
        labels="inferred",
        label_mode="binary",
        class_names=["NORMAL", "PNEUMONIA"],
        color_mode="rgb",
        batch_size=BATCH_SIZE,
        image_size=IMG_SIZE,
        shuffle=False,
        seed=SEED,
        interpolation="bilinear",
    )
    
    test_ds = keras.utils.image_dataset_from_directory(
        TEST_DIR,
        labels="inferred",
        label_mode="binary",
        class_names=["NORMAL", "PNEUMONIA"],
        color_mode="rgb",
        batch_size=BATCH_SIZE,
        image_size=IMG_SIZE,
        shuffle=False,
        seed=SEED,
        interpolation="bilinear",
    )
    
    # Performance optimizations
    AUTOTUNE = tf.data.AUTOTUNE
    train_ds = train_ds.prefetch(AUTOTUNE)
    val_ds = val_ds.prefetch(AUTOTUNE)
    test_ds = test_ds.prefetch(AUTOTUNE)
    
    print(f"Train batches: {tf.data.experimental.cardinality(train_ds).numpy()}")
    print(f"Val batches:   {tf.data.experimental.cardinality(val_ds).numpy()}")
    print(f"Test batches:  {tf.data.experimental.cardinality(test_ds).numpy()}")
    
    return train_ds, val_ds, test_ds


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train_head(model, train_ds, val_ds):
    """Train only the classification head (backbone frozen)."""
    print(f"\n{'='*60}")
    print(f"Phase 1: Training Head Only ({EPOCHS_HEAD} epochs)")
    print(f"{'='*60}")
    
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=LEARNING_RATE_HEAD),
        loss="binary_crossentropy",
        metrics=[
            "accuracy",
            keras.metrics.AUC(name="auc"),
            keras.metrics.Precision(name="precision"),
            keras.metrics.Recall(name="recall"),
        ],
    )
    
    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor="val_auc",
            mode="max",
            patience=3,
            restore_best_weights=True,
            verbose=1,
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=2,
            min_lr=1e-6,
            verbose=1,
        ),
    ]
    
    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS_HEAD,
        callbacks=callbacks,
        verbose=1,
    )
    return history


def fine_tune(model, backbone, train_ds, val_ds):
    """Unfreeze backbone and fine-tune with low learning rate."""
    if EPOCHS_FINETUNE == 0:
        return None
    
    print(f"\n{'='*60}")
    print(f"Phase 2: Fine-tuning Backbone ({EPOCHS_FINETUNE} epochs)")
    print(f"{'='*60}")
    
    # Unfreeze backbone
    backbone.trainable = True
    
    # Recompile with lower LR
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=LEARNING_RATE_FINETUNE),
        loss="binary_crossentropy",
        metrics=[
            "accuracy",
            keras.metrics.AUC(name="auc"),
            keras.metrics.Precision(name="precision"),
            keras.metrics.Recall(name="recall"),
        ],
    )
    
    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor="val_auc",
            mode="max",
            patience=3,
            restore_best_weights=True,
            verbose=1,
        ),
    ]
    
    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS_FINETUNE,
        callbacks=callbacks,
        verbose=1,
    )
    return history


# ---------------------------------------------------------------------------
# TFLite Export
# ---------------------------------------------------------------------------

def export_tflite(model):
    """Convert Keras model to Float32 TFLite and save."""
    print(f"\n{'='*60}")
    print("Exporting to TFLite (Float32)...")
    print(f"{'='*60}")
    
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS]
    converter.inference_input_type = tf.float32
    converter.inference_output_type = tf.float32
    # No quantization - keep Float32
    
    tflite_model = converter.convert()
    
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_TFLITE, "wb") as f:
        f.write(tflite_model)
    
    print(f"Saved to: {OUTPUT_TFLITE}")
    print(f"Size: {len(tflite_model) / 1024 / 1024:.2f} MB")
    
    return tflite_model


def compute_hash(path):
    """Compute SHA-256 hash of file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Validation Test
# ---------------------------------------------------------------------------

def validate_tflite(tflite_model, test_ds):
    """Run inference on test set using TFLite interpreter."""
    print(f"\n{'='*60}")
    print("Validation: TFLite Inference on Test Set")
    print(f"{'='*60}")
    
    interpreter = tf.lite.Interpreter(model_content=tflite_model)
    interpreter.allocate_tensors()
    
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    
    print(f"Input:  {input_details[0]['shape']} {input_details[0]['dtype']}")
    print(f"Output: {output_details[0]['shape']} {output_details[0]['dtype']}")
    
    # Collect predictions
    y_true = []
    y_pred = []
    y_scores = []
    
    for images, labels in test_ds:
        for i in range(images.shape[0]):
            img = images[i:i+1].numpy()  # (1, 224, 224, 3) in [0, 255]
            
            # Convert to our pipeline range [-1, 1]
            img = img.astype(np.float32) / 127.5 - 1.0
            
            interpreter.set_tensor(input_details[0]["index"], img)
            interpreter.invoke()
            output = interpreter.get_tensor(output_details[0]["index"])
            
            pneumonia_prob = float(output.flatten()[0])
            
            y_true.append(int(labels[i].numpy()))
            y_scores.append(pneumonia_prob)
            y_pred.append(1 if pneumonia_prob > 0.5 else 0)
    
    # Metrics
    from sklearn.metrics import accuracy_score, roc_auc_score, classification_report, confusion_matrix
    
    acc = accuracy_score(y_true, y_pred)
    auc = roc_auc_score(y_true, y_scores)
    
    print(f"\nTest Results:")
    print(f"  Accuracy: {acc:.4f}")
    print(f"  AUC:      {auc:.4f}")
    print(f"\nClassification Report:")
    print(classification_report(y_true, y_pred, target_names=["NORMAL", "PNEUMONIA"]))
    print(f"Confusion Matrix:")
    print(confusion_matrix(y_true, y_pred))
    
    return {"accuracy": acc, "auc": auc}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 70)
    print("CareLens - Pneumonia Detection Model Training")
    print("=" * 70)
    
    setup_gpu()
    
    # Load data
    train_ds, val_ds, test_ds = load_datasets()
    
    # Build model
    model, backbone = build_model()
    model.summary(line_length=100)
    
    # Phase 1: Train head
    train_head(model, train_ds, val_ds)
    
    # Phase 2: Fine-tune (optional)
    fine_tune(model, backbone, train_ds, val_ds)
    
    # Export to TFLite
    tflite_model = export_tflite(model)
    
    # Validate
    validate_tflite(tflite_model, test_ds)
    
    # Compute hash
    model_hash = compute_hash(OUTPUT_TFLITE)
    print(f"\n{'='*60}")
    print("TRAINING COMPLETE")
    print(f"{'='*60}")
    print(f"Model: {OUTPUT_TFLITE}")
    print(f"SHA-256: {model_hash}")
    print(f"\nNext steps:")
    print(f"  1. Update models/manifest.json with new hash")
    print(f"  2. Update packages/ml/src/index.ts accuracy field")
    print(f"  3. Restart inference service")
    
    return 0


if __name__ == "__main__":
    # Suppress TF logging
    os.environ["TF_CPP_MIN_LOG_LEVEL"] = "1"
    
    # Check TF version
    print(f"TensorFlow: {tf.__version__}")
    print(f"Keras: {keras.__version__}")
    
    sys.exit(main())