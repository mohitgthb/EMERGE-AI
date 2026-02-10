from ultralytics import YOLO
import torch
def train():
    print("GPU available:", torch.cuda.is_available())
    print("GPU name:", torch.cuda.get_device_name(0))

    model = YOLO("yolov8s.pt")

    model.train(
        data="data/accident.yaml",
        epochs=100,
        imgsz=640,
        batch=16,
        device=0,
        workers=8,
        optimizer="AdamW",
        lr0=0.001,
        cos_lr=0.2,
        patience=20,
        pretrained=True,
        project="runs",
        name="emerge_ai_yolo"
    )

if __name__ == "__main__":
    train()