import cv2
import time
import numpy as np
from ultralytics import YOLO

from clip_writer import add_frame, save_clip, buffer
from accident_logic import is_accident

# CONFIG
VIDEO_SOURCE = "video.mp4"
MODEL_PATH = "yolov8s.pt"
CNN_MODEL_PATH = "models/tf_lite_model.tflite"

FPS = 10
POST_EVENT_SECONDS = 5
ACCIDENT_COOLDOWN = 30

ENABLE_CNN_VERIFICATION = True
CNN_CONFIDENCE_THRESHOLD = 0.65
FUSION_METHOD = "weighted"
FINAL_CONFIDENCE_THRESHOLD = 0.65

# LOAD MODELS
model = YOLO(MODEL_PATH)

cnn_verifier = None
AccidentDecisionFusion = None

if ENABLE_CNN_VERIFICATION:
    try:
        from cnn_verifier import CNNAccidentVerifier, AccidentDecisionFusion
        cnn_verifier = CNNAccidentVerifier(
            model_path=CNN_MODEL_PATH,
            input_size=(250, 250),
            confidence_threshold=CNN_CONFIDENCE_THRESHOLD,
            num_verification_frames=5
        )
        print("✅ CNN Verification: ENABLED")
    except ImportError as e:
        print(f"⚠️ CNN Verifier not available: {e}")
        print("   Falling back to YOLO-only mode")
        ENABLE_CNN_VERIFICATION = False
    except Exception as e:
        print(f"⚠️ CNN Verifier failed: {e}")
        print("   Falling back to YOLO-only mode")
        ENABLE_CNN_VERIFICATION = False
else:
    print("ℹ️ CNN Verification: DISABLED")

cap = cv2.VideoCapture(VIDEO_SOURCE)

# TRACKING STATE
prev_centers = {}
stop_start_time = {}
accident_triggered = False
accident_count = 0
last_accident_time = 0

# HELPER FUNCTIONS
def get_center(box):
    x1, y1, x2, y2 = box
    return int((x1 + x2) / 2), int((y1 + y2) / 2)

def get_speed(track_id, center):
    if track_id not in prev_centers:
        prev_centers[track_id] = center
        return 0

    px, py = prev_centers[track_id]
    cx, cy = center
    prev_centers[track_id] = center

    return np.sqrt((cx - px) ** 2 + (cy - py) ** 2)

def get_stopped_time(track_id, speed):
    now = time.time()
    if speed < 2:
        if track_id not in stop_start_time:
            stop_start_time[track_id] = now
        return now - stop_start_time[track_id]
    else:
        stop_start_time.pop(track_id, None)
        return 0

# MAIN LOOP
while True:
    ret, frame = cap.read()
    if not ret:
        break

    add_frame(frame)

    results = model.track(frame, tracker="bytetrack.yaml", persist=True, conf=0.4)

    vehicles = []

    if results[0].boxes.id is not None:
        for box, cls, track_id in zip(results[0].boxes.xyxy, results[0].boxes.cls, results[0].boxes.id):
            cls = int(cls)
            track_id = int(track_id)

            if cls in [2, 3, 5, 7]:
                x1, y1, x2, y2 = map(int, box.tolist())
                center = get_center((x1, y1, x2, y2))
                speed = get_speed(track_id, center)
                stopped_time = get_stopped_time(track_id, speed)

                vehicles.append({
                    "id": track_id,
                    "box": (x1, y1, x2, y2),
                    "speed": speed,
                    "stopped_time": stopped_time
                })

    current_time = time.time()
    if accident_triggered and (current_time - last_accident_time) > ACCIDENT_COOLDOWN:
        accident_triggered = False
        print("✅ Cooldown complete")

    for vehicle in vehicles:
        if is_accident(vehicle) and not accident_triggered:
            print(f"\n🔔 CANDIDATE ACCIDENT - Vehicle {vehicle['id']} (stopped: {vehicle['stopped_time']:.1f}s, speed: {vehicle['speed']:.1f})")
            
            post_frames = []
            for _ in range(FPS * POST_EVENT_SECONDS):
                ret, f = cap.read()
                if ret:
                    add_frame(f)
                    post_frames.append(f)
                else:
                    break
            
            accident_confirmed = False
            
            if ENABLE_CNN_VERIFICATION:
                print("🔬 CNN verification...")
                try:
                    verification_result = cnn_verifier.verify_accident(
                        frame_buffer=buffer,
                        post_event_frames=post_frames,
                        fps=FPS,
                        aggregation_method="weighted_average",
                        verbose=True
                    )
                    
                    yolo_confidence = AccidentDecisionFusion.compute_yolo_confidence(vehicle)
                    
                    decision = AccidentDecisionFusion.make_decision(
                        yolo_confidence=yolo_confidence,
                        cnn_confidence=verification_result['cnn_confidence'],
                        fusion_method=FUSION_METHOD,
                        final_threshold=FINAL_CONFIDENCE_THRESHOLD,
                        verbose=True
                    )
                    
                    accident_confirmed = decision['confirmed']
                    
                except Exception as e:
                    print(f"⚠️ CNN error: {e} - Falling back to YOLO")
                    accident_confirmed = True
            else:
                accident_confirmed = True
            
            if accident_confirmed:
                accident_triggered = True
                accident_count += 1
                last_accident_time = current_time
                
                filename = f"accident_{accident_count:03d}_{int(current_time)}.mp4"
                save_clip(post_frames, filename)
                print(f"🚨 ACCIDENT #{accident_count} CONFIRMED - Saved: {filename}\n")
            else:
                print("✋ FALSE POSITIVE REJECTED\n")
            
            break

    annotated = results[0].plot()
    cv2.imshow("EMERGE AI", annotated)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()