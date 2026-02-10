import numpy as np

prev_positions = {}

def get_speed(track_id, center):
    if track_id not in prev_positions:
        prev_positions[track_id] = center
        return 0

    px, py = prev_positions[track_id]
    cx, cy = center

    speed = np.sqrt((cx - px)**2 + (cy - py)**2)
    prev_positions[track_id] = center

    return speed
