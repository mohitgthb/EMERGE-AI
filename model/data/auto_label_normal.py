import os
import cv2
from ultralytics import YOLO

# Load pretrained YOLOv8 (COCO)
model = YOLO("yolov8s.pt")

# COCO class IDs → YOUR class IDs
COCO_TO_CUSTOM = {
    2: 0,   # car
    3: 1,   # motorcycle
    0: 2,   # person
    7: 3,   # truck
    5: 4    # bus
}

IMAGE_DIR = "data/raw/frames/normal"
LABEL_DIR = "auto_labels/normal"

os.makedirs(LABEL_DIR, exist_ok=True)

for img_name in os.listdir(IMAGE_DIR):
    if not img_name.lower().endswith((".jpg", ".png", ".jpeg")):
        continue

    img_path = os.path.join(IMAGE_DIR, img_name)
    img = cv2.imread(img_path)

    if img is None:
        continue

    h, w, _ = img.shape
    results = model(img)[0]

    label_file = os.path.join(
        LABEL_DIR, img_name.rsplit(".", 1)[0] + ".txt"
    )

    with open(label_file, "w") as f:
        for box in results.boxes:
            coco_id = int(box.cls[0])

            if coco_id not in COCO_TO_CUSTOM:
                continue

            class_id = COCO_TO_CUSTOM[coco_id]

            x1, y1, x2, y2 = box.xyxy[0]

            x_center = ((x1 + x2) / 2) / w
            y_center = ((y1 + y2) / 2) / h
            bw = (x2 - x1) / w
            bh = (y2 - y1) / h

            f.write(f"{class_id} {x_center:.6f} {y_center:.6f} {bw:.6f} {bh:.6f}\n")

print("✅ Auto-labeling for NORMAL images completed")
