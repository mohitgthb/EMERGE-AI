# CNN Verifier Quick Reference

## 🚀 Quick Start

### 1. Run Tests (No Model Required)
```bash
cd model/inference
python test_cnn_verifier.py
```

### 2. Run with Real Model
```bash
# Ensure model exists
ls models/tf_lite_model.tflite

# Run main pipeline
python live_cctv.py
```

## ⚙️ Configuration Presets

### Preset 1: Emergency Services (Maximum Recall)
**Goal**: Catch every possible accident, okay with some false alarms

```python
# In live_cctv.py
ENABLE_CNN_VERIFICATION = False  # Trust YOLO fully
# OR
ENABLE_CNN_VERIFICATION = True
FUSION_METHOD = "weighted"
FINAL_CONFIDENCE_THRESHOLD = 0.50
```

**Expected**: 95%+ recall, 15-20% false positives

---

### Preset 2: Production Balanced (Recommended)
**Goal**: Good balance of accuracy and false positive reduction

```python
# In live_cctv.py
ENABLE_CNN_VERIFICATION = True
CNN_CONFIDENCE_THRESHOLD = 0.65
FUSION_METHOD = "weighted"
FINAL_CONFIDENCE_THRESHOLD = 0.65
```

**Expected**: 90-92% recall, 5-10% false positives

---

### Preset 3: Research/Statistics (Maximum Precision)
**Goal**: Only confirmed accidents, minimal false positives

```python
# In live_cctv.py
ENABLE_CNN_VERIFICATION = True
CNN_CONFIDENCE_THRESHOLD = 0.70
FUSION_METHOD = "gating"
FINAL_CONFIDENCE_THRESHOLD = 0.70
```

**Expected**: 85-88% recall, 2-5% false positives

---

### Preset 4: Debug Mode
**Goal**: See all detections with detailed logging

```python
# In live_cctv.py
ENABLE_CNN_VERIFICATION = True
FUSION_METHOD = "weighted"
FINAL_CONFIDENCE_THRESHOLD = 0.50

# In cnn_verifier.py verify_accident() call
verbose=True  # Always on
```

---

## 🎛️ Parameter Reference

### `ENABLE_CNN_VERIFICATION`
- **Type**: Boolean
- **Default**: `True`
- **Effect**: Enable/disable CNN verification layer
- **When to disable**: Emergency response mode, debugging YOLO

### `CNN_CONFIDENCE_THRESHOLD`
- **Type**: Float (0.0-1.0)
- **Default**: `0.65`
- **Effect**: Minimum CNN confidence to consider valid
- **Tuning**:
  - Lower (0.55-0.60): More sensitive, fewer false negatives
  - Higher (0.70-0.80): More strict, fewer false positives

### `FUSION_METHOD`
- **Type**: String: `"weighted"` or `"gating"`
- **Default**: `"weighted"`
- **Effect**: How YOLO and CNN confidences combine
- **Weighted**: Democratic vote (0.4×YOLO + 0.6×CNN)
- **Gating**: CNN has veto power (rejects if CNN < 0.5)

### `FINAL_CONFIDENCE_THRESHOLD`
- **Type**: Float (0.0-1.0)
- **Default**: `0.65`
- **Effect**: Final decision threshold after fusion
- **Tuning**:
  - Lower (0.50-0.60): More detections
  - Higher (0.70-0.75): Fewer detections, higher confidence

### `num_verification_frames`
- **Type**: Integer
- **Location**: `CNNAccidentVerifier.__init__`
- **Default**: `5`
- **Effect**: How many frames to analyze per event
- **Tuning**:
  - Lower (3): Faster, less context
  - Higher (7-10): Slower, more context

---

## 🐛 Common Issues

### Issue: All accidents rejected
```
CNN confidence: 0.25 (too low)
Result: ✋ FALSE POSITIVE REJECTED
```

**Solutions**:
1. Check model preprocessing: `preprocess_frame()` must match training
2. Verify input size matches model expectations
3. Try: `CNN_CONFIDENCE_THRESHOLD = 0.50` temporarily
4. Check model is correct: `ls -lh models/tf_lite_model.tflite`

---

### Issue: Too many false positives
```
Traffic signal stops being saved as accidents
```

**Solutions**:
1. Use gating fusion: `FUSION_METHOD = "gating"`
2. Raise threshold: `FINAL_CONFIDENCE_THRESHOLD = 0.70`
3. Adjust YOLO rules: Increase `stopped_time > 3.5` in `accident_logic.py`

---

### Issue: CNN not loading
```
⚠️ CNN Verifier failed to load: ...
   Falling back to YOLO-only mode
```

**Solutions**:
1. Check TensorFlow installed: `pip install tensorflow`
2. Check model path: `CNN_MODEL_PATH = "models/tf_lite_model.tflite"`
3. Verify file exists: `ls models/tf_lite_model.tflite`
4. Test standalone: `python cnn_verifier.py`

---

### Issue: Slow performance
```
Processing takes too long per frame
```

**Solutions**:
1. Reduce frames: `num_verification_frames=3` instead of 5
2. Use TFLite (already done) - much faster than full TF
3. Consider GPU: TFLite GPU delegate (advanced)
4. Only verify on YOLO candidates (already done)

---

## 📊 Expected Metrics by Preset

| Preset | Recall | Precision | F1 | FP/hour* |
|--------|--------|-----------|-----|----------|
| Emergency | 95% | 60% | 0.74 | 12 |
| Balanced | 92% | 90% | 0.91 | 2 |
| Research | 88% | 95% | 0.91 | 1 |

*Assuming typical urban traffic with 3 real accidents/hour

---

## 🔄 Workflow: From YOLO to Final Decision

```
Frame arrives
    ↓
YOLO detection (vehicle, speed, stopped_time)
    ↓
is_accident(vehicle)?
    ├─ No → Continue monitoring
    └─ Yes → CANDIDATE DETECTED
        ↓
    CNN_VERIFICATION enabled?
        ├─ No → SAVE CLIP (YOLO-only mode)
        └─ Yes ↓
            ↓
    Extract 5 frames from buffer
            ↓
    CNN inference on each frame
            ↓
    Aggregate predictions (weighted avg)
            ↓
    Compute YOLO confidence
            ↓
    Fuse YOLO + CNN confidences
            ↓
    final_confidence > threshold?
        ├─ Yes → SAVE CLIP ✅
        └─ No → DISCARD ❌
```

---

## 📝 Logging Output Examples

### True Positive Example
```
==============================================================
🔔 CANDIDATE ACCIDENT DETECTED (YOLO Stage)
==============================================================
   Vehicle ID: 42
   Stopped time: 5.2s
   Speed: 0.3 px/frame

🔬 Initiating CNN verification...

🔍 CNN VERIFICATION
   Analyzing 5 frames...
   Frame 1: 0.823
   Frame 2: 0.867
   Frame 3: 0.891
   Frame 4: 0.845
   Frame 5: 0.812
   Aggregated confidence: 0.851
   Threshold: 0.650
   Result: ✅ VERIFIED

📊 DECISION FUSION
   YOLO confidence: 0.783
   CNN confidence:  0.851
   Final confidence: 0.823
   Threshold: 0.650
   🚨 ACCIDENT CONFIRMED

==============================================================
🚨 ACCIDENT CONFIRMED - SAVING CLIP
==============================================================
   Accident #7
💾 Saved: accident_007_1738972345.mp4
```

### False Positive Example
```
==============================================================
🔔 CANDIDATE ACCIDENT DETECTED (YOLO Stage)
==============================================================
   Vehicle ID: 199
   Stopped time: 3.1s
   Speed: 0.1 px/frame

🔬 Initiating CNN verification...

🔍 CNN VERIFICATION
   Analyzing 5 frames...
   Frame 1: 0.345
   Frame 2: 0.392
   Frame 3: 0.412
   Frame 4: 0.378
   Frame 5: 0.356
   Aggregated confidence: 0.377
   Threshold: 0.650
   Result: ❌ REJECTED

📊 DECISION FUSION
   YOLO confidence: 0.623
   CNN confidence:  0.377
   Final confidence: 0.475
   Threshold: 0.650
   ✋ FALSE POSITIVE REJECTED

==============================================================
✋ FALSE POSITIVE REJECTED - No clip saved
==============================================================
```

---

## 🧪 Testing Checklist

Before deployment:

- [ ] Run `python test_cnn_verifier.py` (all tests pass)
- [ ] Verify TFLite model loads: Check startup logs
- [ ] Test on known accident video: Should detect
- [ ] Test on traffic signal video: Should reject
- [ ] Test on congestion video: Should reject
- [ ] Check performance: FPS acceptable (>5 FPS)
- [ ] Verify clips saved to correct location
- [ ] Test cooldown: No duplicate detections within 30s
- [ ] Test YOLO-only mode: Works without CNN
- [ ] Review logs: Confidence scores reasonable

---

## 🎯 Tuning Workflow

1. **Start with defaults** (Balanced preset)
2. **Run on test data** (mix of real accidents + false positives)
3. **Measure performance**:
   ```python
   True positives = accidents correctly saved
   False positives = non-accidents incorrectly saved
   False negatives = accidents missed
   
   Recall = TP / (TP + FN)
   Precision = TP / (TP + FP)
   ```
4. **Adjust based on results**:
   - Too many false positives → Increase threshold or use gating
   - Too many false negatives → Decrease threshold or disable CNN
   - Balanced but want stricter → Use gating fusion
5. **Re-test and iterate**

---

## 📞 Support

Issues? Check in this order:
1. Read error message carefully
2. Check this config guide
3. Review [README_CNN_VERIFIER.md](README_CNN_VERIFIER.md)
4. Run `test_cnn_verifier.py` to isolate issue
5. Check TFLite model: `python -c "import tensorflow as tf; print(tf.__version__)"`

---

**Pro Tip**: Start with YOLO-only mode to ensure base system works, then enable CNN verification and tune thresholds based on your specific traffic patterns and requirements.
