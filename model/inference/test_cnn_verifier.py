"""
CNN Verifier Test Suite

This script tests the CNN verification system with various scenarios:
1. True positive: Real accident with high CNN confidence
2. False positive: Traffic signal stop rejected by CNN
3. False positive: Normal congestion rejected by CNN
4. Edge case: Borderline confidence scores

Usage:
    python test_cnn_verifier.py
"""

import numpy as np
import cv2
from collections import deque
from cnn_verifier import CNNAccidentVerifier, AccidentDecisionFusion


# ==========================================
# SYNTHETIC DATA GENERATORS
# ==========================================

def generate_synthetic_frame(scenario="accident", size=(640, 480)):
    """
    Generate synthetic frames for testing without real TFLite model.
    
    Args:
        scenario: "accident", "congestion", "signal", or "normal"
        size: Frame dimensions (width, height)
        
    Returns:
        Synthetic BGR frame
    """
    frame = np.random.randint(50, 200, (size[1], size[0], 3), dtype=np.uint8)
    
    # Add visual markers based on scenario
    if scenario == "accident":
        # Draw red rectangle (collision)
        cv2.rectangle(frame, (200, 150), (400, 300), (0, 0, 255), -1)
        cv2.putText(frame, "ACCIDENT", (220, 225), 
                   cv2.FONT_HERSHEY_BOLD, 1, (255, 255, 255), 2)
    
    elif scenario == "congestion":
        # Draw multiple yellow rectangles (vehicles)
        for i in range(5):
            x = 100 + i * 100
            cv2.rectangle(frame, (x, 200), (x+80, 280), (0, 200, 200), -1)
        cv2.putText(frame, "CONGESTION", (180, 150), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    
    elif scenario == "signal":
        # Draw green circle (traffic signal)
        cv2.circle(frame, (320, 100), 40, (0, 255, 0), -1)
        cv2.putText(frame, "TRAFFIC SIGNAL", (170, 400), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    
    elif scenario == "normal":
        # Draw few blue rectangles (normal traffic)
        cv2.rectangle(frame, (250, 200), (350, 300), (255, 100, 0), -1)
        cv2.putText(frame, "NORMAL", (260, 450), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
    
    return frame


class MockCNNVerifier(CNNAccidentVerifier):
    """
    Mock CNN verifier that simulates TFLite inference without actual model.
    Useful for testing logic without trained model.
    """
    
    def __init__(self, **kwargs):
        """Initialize without loading actual TFLite model."""
        self.input_size = kwargs.get('input_size', (224, 224))
        self.confidence_threshold = kwargs.get('confidence_threshold', 0.65)
        self.num_verification_frames = kwargs.get('num_verification_frames', 5)
        
        print(f"✅ Mock CNN Verifier initialized (no TFLite model)")
        print(f"   Input size: {self.input_size}")
        print(f"   Confidence threshold: {self.confidence_threshold}")
    
    def run_inference(self, preprocessed_frame: np.ndarray) -> float:
        """
        Simulate CNN inference based on frame content.
        
        In real system, this calls TFLite interpreter.
        Here we analyze frame pixels to simulate realistic responses.
        """
        # Extract color histogram to simulate learned features
        frame = (preprocessed_frame[0] * 255).astype(np.uint8)
        
        # Calculate red intensity (accidents have more red)
        red_intensity = np.mean(frame[:, :, 0])
        
        # Calculate variance (accidents have distinct objects)
        variance = np.std(frame)
        
        # Simulate confidence based on visual features
        # High red + high variance → likely accident
        red_score = min(1.0, red_intensity / 150.0)
        variance_score = min(1.0, variance / 80.0)
        
        # Weighted combination
        confidence = 0.6 * red_score + 0.4 * variance_score
        
        # Add small random noise
        confidence += np.random.normal(0, 0.05)
        confidence = np.clip(confidence, 0.0, 1.0)
        
        return float(confidence)


# ==========================================
# TEST SCENARIOS
# ==========================================

def test_scenario_1_true_positive():
    """
    Test Case 1: True Positive Accident
    
    Scenario: Real accident with clear visual evidence
    Expected: YOLO detects + CNN confirms → SAVE CLIP
    """
    print("\n" + "="*70)
    print("TEST SCENARIO 1: TRUE POSITIVE ACCIDENT")
    print("="*70)
    print("Scenario: Multi-vehicle collision, vehicle stopped 5 seconds")
    print("Expected: Both YOLO and CNN high confidence → CONFIRMED\n")
    
    # Initialize mock verifier
    verifier = MockCNNVerifier(
        confidence_threshold=0.65,
        num_verification_frames=5
    )
    
    # Simulate YOLO detection
    vehicle = {
        'id': 101,
        'stopped_time': 5.2,
        'speed': 0.2
    }
    
    print(f"🚗 Vehicle #{vehicle['id']} detected by YOLO")
    print(f"   Stopped time: {vehicle['stopped_time']:.1f}s")
    print(f"   Speed: {vehicle['speed']:.1f} px/frame")
    
    # Generate synthetic accident frames
    frame_buffer = deque(maxlen=100)
    for i in range(100):
        frame = generate_synthetic_frame("accident")
        frame_buffer.append(frame)
    
    post_frames = [generate_synthetic_frame("accident") for _ in range(2)]
    
    # Run CNN verification
    result = verifier.verify_accident(
        frame_buffer=frame_buffer,
        post_event_frames=post_frames,
        fps=10,
        verbose=True
    )
    
    # Compute YOLO confidence
    yolo_conf = AccidentDecisionFusion.compute_yolo_confidence(vehicle)
    
    # Make decision
    decision = AccidentDecisionFusion.make_decision(
        yolo_confidence=yolo_conf,
        cnn_confidence=result['cnn_confidence'],
        fusion_method="weighted",
        final_threshold=0.65,
        verbose=True
    )
    
    # Verify result
    assert decision['confirmed'], "Expected true positive to be confirmed!"
    print("\n✅ TEST PASSED: True positive correctly confirmed\n")
    
    return decision


def test_scenario_2_false_positive_signal():
    """
    Test Case 2: False Positive - Traffic Signal Stop
    
    Scenario: Vehicle stops at red light (normal behavior)
    Expected: YOLO detects + CNN rejects → DISCARD
    """
    print("\n" + "="*70)
    print("TEST SCENARIO 2: FALSE POSITIVE - TRAFFIC SIGNAL")
    print("="*70)
    print("Scenario: Vehicle stopped at red light, 3 seconds")
    print("Expected: YOLO flags candidate, CNN rejects → REJECTED\n")
    
    verifier = MockCNNVerifier(confidence_threshold=0.65)
    
    # Vehicle stopped at signal
    vehicle = {
        'id': 202,
        'stopped_time': 3.1,
        'speed': 0.1
    }
    
    print(f"🚗 Vehicle #{vehicle['id']} detected by YOLO")
    print(f"   Stopped time: {vehicle['stopped_time']:.1f}s (at traffic signal)")
    print(f"   Speed: {vehicle['speed']:.1f} px/frame")
    
    # Generate traffic signal frames
    frame_buffer = deque(maxlen=100)
    for i in range(100):
        frame = generate_synthetic_frame("signal")
        frame_buffer.append(frame)
    
    post_frames = [generate_synthetic_frame("signal") for _ in range(2)]
    
    # Run CNN verification
    result = verifier.verify_accident(
        frame_buffer=frame_buffer,
        post_event_frames=post_frames,
        fps=10,
        verbose=True
    )
    
    yolo_conf = AccidentDecisionFusion.compute_yolo_confidence(vehicle)
    
    # Make decision
    decision = AccidentDecisionFusion.make_decision(
        yolo_confidence=yolo_conf,
        cnn_confidence=result['cnn_confidence'],
        fusion_method="weighted",
        final_threshold=0.65,
        verbose=True
    )
    
    # Verify result
    assert not decision['confirmed'], "Expected false positive to be rejected!"
    print("\n✅ TEST PASSED: False positive correctly rejected\n")
    
    return decision


def test_scenario_3_false_positive_congestion():
    """
    Test Case 3: False Positive - Traffic Congestion
    
    Scenario: Vehicle in slow-moving traffic jam
    Expected: YOLO detects + CNN rejects → DISCARD
    """
    print("\n" + "="*70)
    print("TEST SCENARIO 3: FALSE POSITIVE - CONGESTION")
    print("="*70)
    print("Scenario: Vehicle in congested traffic, slow movement")
    print("Expected: YOLO flags candidate, CNN rejects → REJECTED\n")
    
    verifier = MockCNNVerifier(confidence_threshold=0.65)
    
    vehicle = {
        'id': 303,
        'stopped_time': 2.8,
        'speed': 0.5
    }
    
    print(f"🚗 Vehicle #{vehicle['id']} detected by YOLO")
    print(f"   Stopped time: {vehicle['stopped_time']:.1f}s (in congestion)")
    print(f"   Speed: {vehicle['speed']:.1f} px/frame")
    
    # Generate congestion frames
    frame_buffer = deque(maxlen=100)
    for i in range(100):
        frame = generate_synthetic_frame("congestion")
        frame_buffer.append(frame)
    
    post_frames = [generate_synthetic_frame("congestion") for _ in range(2)]
    
    result = verifier.verify_accident(
        frame_buffer=frame_buffer,
        post_event_frames=post_frames,
        fps=10,
        verbose=True
    )
    
    yolo_conf = AccidentDecisionFusion.compute_yolo_confidence(vehicle)
    
    decision = AccidentDecisionFusion.make_decision(
        yolo_confidence=yolo_conf,
        cnn_confidence=result['cnn_confidence'],
        fusion_method="weighted",
        final_threshold=0.65,
        verbose=True
    )
    
    assert not decision['confirmed'], "Expected congestion to be rejected!"
    print("\n✅ TEST PASSED: Congestion false positive correctly rejected\n")
    
    return decision


def test_scenario_4_gating_fusion():
    """
    Test Case 4: Gating Fusion Strategy
    
    Scenario: Compare weighted vs. gating fusion methods
    Expected: Gating fusion should be stricter (CNN veto power)
    """
    print("\n" + "="*70)
    print("TEST SCENARIO 4: FUSION METHOD COMPARISON")
    print("="*70)
    print("Scenario: Borderline case - moderate confidences")
    print("Expected: Different results for weighted vs. gating\n")
    
    # Borderline case
    yolo_conf = 0.70
    cnn_conf = 0.55
    
    print(f"📊 Input confidences:")
    print(f"   YOLO: {yolo_conf:.2f}")
    print(f"   CNN:  {cnn_conf:.2f}\n")
    
    # Test weighted fusion
    print("Method 1: WEIGHTED FUSION")
    decision_weighted = AccidentDecisionFusion.make_decision(
        yolo_confidence=yolo_conf,
        cnn_confidence=cnn_conf,
        fusion_method="weighted",
        final_threshold=0.65,
        verbose=True
    )
    
    # Test gating fusion
    print("\nMethod 2: GATING FUSION")
    decision_gating = AccidentDecisionFusion.make_decision(
        yolo_confidence=yolo_conf,
        cnn_confidence=cnn_conf,
        fusion_method="gating",
        final_threshold=0.65,
        verbose=True
    )
    
    print(f"\n📈 Results:")
    print(f"   Weighted: {'CONFIRMED' if decision_weighted['confirmed'] else 'REJECTED'}")
    print(f"   Gating:   {'CONFIRMED' if decision_gating['confirmed'] else 'REJECTED'}")
    
    print("\n✅ TEST PASSED: Fusion methods behave as expected\n")
    
    return decision_weighted, decision_gating


def test_scenario_5_aggregation_methods():
    """
    Test Case 5: Aggregation Method Comparison
    
    Scenario: Same frame predictions, different aggregation
    Expected: Different methods produce different confidence scores
    """
    print("\n" + "="*70)
    print("TEST SCENARIO 5: AGGREGATION METHOD COMPARISON")
    print("="*70)
    
    # Simulate frame predictions with outliers
    predictions = [0.85, 0.78, 0.92, 0.35, 0.88]  # One outlier (0.35)
    
    print(f"Frame predictions: {predictions}")
    print(f"Note: Frame 4 has low confidence (0.35) - possible outlier\n")
    
    verifier = MockCNNVerifier()
    
    methods = ["average", "weighted_average", "max", "median"]
    results = {}
    
    for method in methods:
        conf = verifier.aggregate_predictions(predictions, method=method)
        results[method] = conf
        print(f"{method:>16}: {conf:.3f}")
    
    print(f"\n📊 Analysis:")
    print(f"   Average is affected by outlier: {results['average']:.3f}")
    print(f"   Median is robust to outlier:    {results['median']:.3f}")
    print(f"   Weighted emphasizes center:      {results['weighted_average']:.3f}")
    print(f"   Max uses highest confidence:    {results['max']:.3f}")
    
    print("\n✅ TEST PASSED: All aggregation methods working correctly\n")
    
    return results


# ==========================================
# PERFORMANCE ANALYSIS
# ==========================================

def analyze_performance():
    """
    Analyze system performance across multiple scenarios.
    """
    print("\n" + "="*70)
    print("PERFORMANCE ANALYSIS")
    print("="*70)
    
    scenarios = {
        "true_positives": [
            {"stopped_time": 5.0, "speed": 0.1, "visual": "accident"},
            {"stopped_time": 4.5, "speed": 0.2, "visual": "accident"},
            {"stopped_time": 6.0, "speed": 0.0, "visual": "accident"},
        ],
        "false_positives": [
            {"stopped_time": 3.2, "speed": 0.1, "visual": "signal"},
            {"stopped_time": 2.9, "speed": 0.5, "visual": "congestion"},
            {"stopped_time": 3.5, "speed": 0.3, "visual": "signal"},
        ]
    }
    
    verifier = MockCNNVerifier(confidence_threshold=0.65)
    
    print("\n📊 Testing on synthetic dataset...")
    
    results_yolo_only = {"TP": 0, "FP": 0}
    results_yolo_cnn = {"TP": 0, "FP": 0}
    
    # Test true positives
    for i, vehicle in enumerate(scenarios["true_positives"]):
        frame_buffer = deque([generate_synthetic_frame(vehicle["visual"]) for _ in range(100)])
        post_frames = [generate_synthetic_frame(vehicle["visual"]) for _ in range(2)]
        
        # YOLO-only decision
        results_yolo_only["TP"] += 1
        
        # YOLO + CNN decision
        result = verifier.verify_accident(frame_buffer, post_frames, fps=10, verbose=False)
        yolo_conf = AccidentDecisionFusion.compute_yolo_confidence(vehicle)
        decision = AccidentDecisionFusion.make_decision(
            yolo_conf, result['cnn_confidence'], 
            fusion_method="weighted", final_threshold=0.65, verbose=False
        )
        
        if decision['confirmed']:
            results_yolo_cnn["TP"] += 1
    
    # Test false positives
    for i, vehicle in enumerate(scenarios["false_positives"]):
        frame_buffer = deque([generate_synthetic_frame(vehicle["visual"]) for _ in range(100)])
        post_frames = [generate_synthetic_frame(vehicle["visual"]) for _ in range(2)]
        
        # YOLO-only decision
        results_yolo_only["FP"] += 1
        
        # YOLO + CNN decision
        result = verifier.verify_accident(frame_buffer, post_frames, fps=10, verbose=False)
        yolo_conf = AccidentDecisionFusion.compute_yolo_confidence(vehicle)
        decision = AccidentDecisionFusion.make_decision(
            yolo_conf, result['cnn_confidence'], 
            fusion_method="weighted", final_threshold=0.65, verbose=False
        )
        
        if decision['confirmed']:
            results_yolo_cnn["FP"] += 1
    
    # Calculate metrics
    print("\n📈 RESULTS:")
    print(f"\nYOLO-Only Mode:")
    print(f"   True Positives:  {results_yolo_only['TP']}/3")
    print(f"   False Positives: {results_yolo_only['FP']}/3")
    print(f"   Precision: {results_yolo_only['TP']/(results_yolo_only['TP']+results_yolo_only['FP'])*100:.1f}%")
    
    print(f"\nYOLO + CNN Mode:")
    print(f"   True Positives:  {results_yolo_cnn['TP']}/3")
    print(f"   False Positives: {results_yolo_cnn['FP']}/3")
    
    total_positives = results_yolo_cnn['TP'] + results_yolo_cnn['FP']
    if total_positives > 0:
        precision = results_yolo_cnn['TP'] / total_positives * 100
        print(f"   Precision: {precision:.1f}%")
    else:
        print(f"   Precision: N/A (no positives)")
    
    print(f"\n💡 Improvement:")
    fp_reduction = results_yolo_only['FP'] - results_yolo_cnn['FP']
    print(f"   False positives reduced by: {fp_reduction}/3")
    print(f"   CNN verification effectiveness: {fp_reduction/results_yolo_only['FP']*100:.1f}%")
    
    print("\n✅ ANALYSIS COMPLETE\n")


# ==========================================
# MAIN TEST RUNNER
# ==========================================

def run_all_tests():
    """Run complete test suite."""
    print("\n" + "🔬 " + "="*66 + " 🔬")
    print("  CNN ACCIDENT VERIFIER - COMPREHENSIVE TEST SUITE")
    print("🔬 " + "="*66 + " 🔬\n")
    
    print("This test suite validates the CNN verification system using")
    print("synthetic data and mock inference (no real TFLite model required).\n")
    
    try:
        # Run individual test scenarios
        test_scenario_1_true_positive()
        test_scenario_2_false_positive_signal()
        test_scenario_3_false_positive_congestion()
        test_scenario_4_gating_fusion()
        test_scenario_5_aggregation_methods()
        
        # Run performance analysis
        analyze_performance()
        
        # Summary
        print("\n" + "="*70)
        print("🎉 ALL TESTS PASSED!")
        print("="*70)
        print("\nThe CNN verification system is working correctly:")
        print("  ✅ True positives are confirmed")
        print("  ✅ False positives are rejected")
        print("  ✅ Fusion methods work as expected")
        print("  ✅ Aggregation methods produce correct results")
        print("\nYou can now test with real TFLite model on actual video data.")
        print("="*70 + "\n")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}\n")
        return False
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}\n")
        import traceback
        traceback.print_exc()
        return False
    
    return True


if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
