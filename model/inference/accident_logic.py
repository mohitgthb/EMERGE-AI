def is_accident(vehicle):
    """
    Detect accident based on abnormal vehicle behavior over time.
    Real accidents are defined by temporal abnormality, not collision frames.
    
    Primary signals:
    - Vehicle stopped in lane for extended period
    - Low/zero movement (speed < 1)
    - Stopped time > 2.5 seconds
    """
    if (
        vehicle["stopped_time"] > 2.5 and
        vehicle["speed"] < 1
    ):
        return True
    return False


def sudden_stop(prev_speed, curr_speed):
    """Detect sudden speed drop (optional enhancement signal)"""
    return prev_speed > 6 and curr_speed < 1


# FUTURE ENHANCEMENT: Multi-signal detection
# Trigger if 2 of 3 signals occur:
# ✅ vehicle stopped in lane (stopped_time > 2.5)
# ✅ sudden speed drop (prev_speed > 6 → curr_speed < 1)  
# ✅ people count increases nearby (YOLO person detections)
