from collections import deque
import cv2

FPS = 10
BUFFER_SEC = 10
buffer = deque(maxlen=FPS * BUFFER_SEC)  # Exported for CNN verifier access

def add_frame(frame):
    """Add a frame to the ring buffer."""
    buffer.append(frame)

def save_clip(post_frames, filename):
    h, w, _ = buffer[0].shape
    out = cv2.VideoWriter(
        filename,
        cv2.VideoWriter_fourcc(*"mp4v"),
        FPS,
        (w, h)
    )

    for f in list(buffer) + post_frames:
        out.write(f)

    out.release()
