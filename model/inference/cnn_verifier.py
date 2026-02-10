"""
CNN Verification Module for Accident Detection

This module provides a verification layer that runs ONLY when YOLO+tracking
flags a candidate accident. It uses a TensorFlow Lite CNN model to verify
whether the candidate is a true accident or a false positive.

Architecture:
    YOLO + tracking + rules → candidate event → CNN verification → final decision

Key Features:
- TFLite inference for efficient edge deployment
- Frame extraction from ring buffer (no full video scan)
- Multiple aggregation strategies (average, weighted, max)
- Confidence fusion between YOLO and CNN
- Designed to reduce false positives (traffic signals, normal stops, congestion)
"""

import numpy as np
import cv2
import tensorflow as tf
from typing import List, Tuple, Dict
from collections import deque


class CNNAccidentVerifier:
    """
    CNN-based accident verifier using TensorFlow Lite.
    
    This class encapsulates the CNN verification logic and provides
    methods to verify accident candidates flagged by YOLO logic.
    """
    
    def __init__(
        self,
        model_path: str = "models/tf_lite_model.tflite",
        input_size: Tuple[int, int] = (224, 224),
        confidence_threshold: float = 0.65,
        num_verification_frames: int = 5
    ):
        """
        Initialize the CNN verifier.
        
        Args:
            model_path: Path to the TFLite model file
            input_size: Expected input size (width, height) for the CNN
            confidence_threshold: Minimum confidence to confirm accident
            num_verification_frames: Number of frames to extract around event
        """
        self.model_path = model_path
        self.input_size = input_size
        self.confidence_threshold = confidence_threshold
        self.num_verification_frames = num_verification_frames
        
        # Load TFLite model
        self.interpreter = tf.lite.Interpreter(model_path=model_path)
        self.interpreter.allocate_tensors()
        
        # Get input and output tensor details
        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()
        
        print(f"✅ CNN Verifier initialized")
        print(f"   Model: {model_path}")
        print(f"   Input shape: {self.input_details[0]['shape']}")
        print(f"   Output shape: {self.output_details[0]['shape']}")
        
    def preprocess_frame(self, frame: np.ndarray) -> np.ndarray:
        """
        Preprocess a single frame for CNN input.
        
        Args:
            frame: Raw frame from video (BGR format)
            
        Returns:
            Preprocessed frame ready for TFLite inference
        """
        # Resize to expected input size
        resized = cv2.resize(frame, self.input_size)
        
        # Convert BGR to RGB (if model expects RGB)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        
        # Normalize to [0, 1] range
        normalized = rgb.astype(np.float32) / 255.0
        
        # Add batch dimension [1, H, W, C]
        batched = np.expand_dims(normalized, axis=0)
        
        return batched
    
    def run_inference(self, preprocessed_frame: np.ndarray) -> float:
        """
        Run TFLite inference on a single preprocessed frame.
        
        Args:
            preprocessed_frame: Preprocessed frame with batch dimension
            
        Returns:
            Accident probability (0-1 range)
        """
        # Set input tensor
        self.interpreter.set_tensor(
            self.input_details[0]['index'],
            preprocessed_frame
        )
        
        # Run inference
        self.interpreter.invoke()
        
        # Get output tensor
        output = self.interpreter.get_tensor(self.output_details[0]['index'])
        
        # Extract probability
        # Assuming binary classification: output shape is [1, 2] or [1, 1]
        if output.shape[-1] == 2:
            # Softmax output: [non_accident_prob, accident_prob]
            accident_prob = output[0][1]
        else:
            # Sigmoid output: [accident_prob]
            accident_prob = output[0][0]
        
        return float(accident_prob)
    
    def extract_verification_frames(
        self,
        frame_buffer: deque,
        fps: int = 10
    ) -> List[np.ndarray]:
        """
        Extract representative frames around the accident event.
        
        Strategy: Extract frames at specific time offsets from the event:
        - 2 seconds before event
        - 1 second before event
        - Event frame (current)
        - 1 second after event (if available)
        - 2 seconds after event (if available)
        
        Args:
            frame_buffer: Ring buffer containing recent frames
            fps: Frames per second of the video
            
        Returns:
            List of extracted frames (may be fewer than num_verification_frames)
        """
        buffer_list = list(frame_buffer)
        buffer_size = len(buffer_list)
        
        # Event frame is at the end of buffer (most recent)
        event_idx = buffer_size - 1
        
        # Calculate frame indices for verification
        # Frames: -2s, -1s, 0s (post-event frames will be added later)
        frame_offsets = [-2 * fps, -1 * fps, 0]
        
        frames = []
        for offset in frame_offsets:
            idx = event_idx + offset
            if 0 <= idx < buffer_size:
                frames.append(buffer_list[idx])
        
        return frames
    
    def aggregate_predictions(
        self,
        predictions: List[float],
        method: str = "weighted_average"
    ) -> float:
        """
        Aggregate CNN predictions from multiple frames.
        
        Args:
            predictions: List of accident probabilities from each frame
            method: Aggregation method ("average", "weighted_average", "max", "median")
            
        Returns:
            Aggregated confidence score
        """
        if not predictions:
            return 0.0
        
        if method == "average":
            return np.mean(predictions)
        
        elif method == "weighted_average":
            # Give more weight to central frames (closer to event)
            # Weights: [0.15, 0.25, 0.40, 0.15, 0.05] for 5 frames
            n = len(predictions)
            if n == 1:
                return predictions[0]
            
            # Create descending weights from center
            weights = []
            center = n // 2
            for i in range(n):
                distance = abs(i - center)
                weight = 1.0 / (1.0 + distance)  # Inverse distance weighting
                weights.append(weight)
            
            # Normalize weights
            weights = np.array(weights)
            weights = weights / weights.sum()
            
            return float(np.average(predictions, weights=weights))
        
        elif method == "max":
            # Use maximum confidence (most optimistic)
            return max(predictions)
        
        elif method == "median":
            # Use median to be robust against outliers
            return float(np.median(predictions))
        
        else:
            raise ValueError(f"Unknown aggregation method: {method}")
    
    def verify_accident(
        self,
        frame_buffer: deque,
        post_event_frames: List[np.ndarray] = None,
        fps: int = 10,
        aggregation_method: str = "weighted_average",
        verbose: bool = True
    ) -> Dict:
        """
        Verify if the candidate accident is a true positive.
        
        This is the main verification function that:
        1. Extracts frames around the event
        2. Runs CNN inference on each frame
        3. Aggregates predictions
        4. Returns verification result
        
        Args:
            frame_buffer: Ring buffer containing pre-event frames
            post_event_frames: Optional list of frames captured after event
            fps: Frames per second
            aggregation_method: Method to aggregate predictions
            verbose: Whether to print detailed information
            
        Returns:
            Dictionary containing:
                - 'cnn_confidence': Aggregated CNN confidence (0-1)
                - 'frame_predictions': Individual predictions for each frame
                - 'num_frames_analyzed': Number of frames used
                - 'verified': Boolean indicating if accident is confirmed
        """
        # Extract pre-event frames
        pre_frames = self.extract_verification_frames(frame_buffer, fps)
        
        # Combine with post-event frames if available
        verification_frames = pre_frames.copy()
        if post_event_frames:
            # Add 1-2 post-event frames
            verification_frames.extend(post_event_frames[:2])
        
        # Limit to configured number of frames
        verification_frames = verification_frames[:self.num_verification_frames]
        
        if verbose:
            print(f"\n🔍 CNN VERIFICATION")
            print(f"   Analyzing {len(verification_frames)} frames...")
        
        # Run CNN inference on each frame
        frame_predictions = []
        for i, frame in enumerate(verification_frames):
            preprocessed = self.preprocess_frame(frame)
            prob = self.run_inference(preprocessed)
            frame_predictions.append(prob)
            
            if verbose:
                print(f"   Frame {i+1}: {prob:.3f}")
        
        # Aggregate predictions
        cnn_confidence = self.aggregate_predictions(
            frame_predictions,
            method=aggregation_method
        )
        
        # Make verification decision
        verified = cnn_confidence >= self.confidence_threshold
        
        if verbose:
            print(f"   Aggregated confidence: {cnn_confidence:.3f}")
            print(f"   Threshold: {self.confidence_threshold:.3f}")
            print(f"   Result: {'✅ VERIFIED' if verified else '❌ REJECTED'}")
        
        return {
            'cnn_confidence': cnn_confidence,
            'frame_predictions': frame_predictions,
            'num_frames_analyzed': len(verification_frames),
            'verified': verified
        }


class AccidentDecisionFusion:
    """
    Fuses YOLO-based confidence with CNN confidence to make final decision.
    
    This class implements various fusion strategies to combine rule-based
    detection (YOLO) with learned detection (CNN).
    """
    
    @staticmethod
    def compute_yolo_confidence(vehicle: Dict) -> float:
        """
        Compute YOLO confidence based on vehicle behavior metrics.
        
        Args:
            vehicle: Dictionary with 'stopped_time' and 'speed'
            
        Returns:
            YOLO confidence score (0-1)
        """
        stopped_time = vehicle.get('stopped_time', 0)
        speed = vehicle.get('speed', 0)
        
        # Map stopped_time to confidence
        # 2.5s → 0.5, 5s → 0.75, 10s+ → 0.95
        time_conf = min(0.95, 0.3 + (stopped_time / 10.0) * 0.65)
        
        # Map speed to confidence (lower speed = higher confidence)
        # speed < 0.5 → 1.0, speed 1-2 → 0.7, speed 2+ → 0.3
        if speed < 0.5:
            speed_conf = 1.0
        elif speed < 1.0:
            speed_conf = 0.9
        elif speed < 2.0:
            speed_conf = 0.7
        else:
            speed_conf = 0.3
        
        # Combine with weighted average
        yolo_confidence = 0.6 * time_conf + 0.4 * speed_conf
        
        return yolo_confidence
    
    @staticmethod
    def weighted_fusion(
        yolo_confidence: float,
        cnn_confidence: float,
        yolo_weight: float = 0.4,
        cnn_weight: float = 0.6
    ) -> float:
        """
        Weighted fusion of YOLO and CNN confidences.
        
        Strategy: CNN gets higher weight as it's a learned verifier
        
        Args:
            yolo_confidence: Confidence from YOLO logic (0-1)
            cnn_confidence: Confidence from CNN verifier (0-1)
            yolo_weight: Weight for YOLO (default 0.4)
            cnn_weight: Weight for CNN (default 0.6)
            
        Returns:
            Fused confidence score
        """
        return yolo_weight * yolo_confidence + cnn_weight * cnn_confidence
    
    @staticmethod
    def gating_fusion(
        yolo_confidence: float,
        cnn_confidence: float,
        cnn_gate_threshold: float = 0.5
    ) -> Tuple[float, bool]:
        """
        Gating fusion: CNN acts as a gate/veto mechanism.
        
        Strategy: YOLO suggests, CNN confirms or rejects
        
        Args:
            yolo_confidence: Confidence from YOLO logic
            cnn_confidence: Confidence from CNN verifier
            cnn_gate_threshold: Minimum CNN confidence to pass gate
            
        Returns:
            Tuple of (final_confidence, passed_gate)
        """
        if cnn_confidence < cnn_gate_threshold:
            # CNN rejects → final confidence is low
            return cnn_confidence, False
        else:
            # CNN confirms → use weighted fusion
            final_conf = 0.4 * yolo_confidence + 0.6 * cnn_confidence
            return final_conf, True
    
    @staticmethod
    def make_decision(
        yolo_confidence: float,
        cnn_confidence: float,
        fusion_method: str = "weighted",
        final_threshold: float = 0.65,
        verbose: bool = True
    ) -> Dict:
        """
        Make final accident confirmation decision with confidence fusion.
        
        Args:
            yolo_confidence: Confidence from YOLO (0-1)
            cnn_confidence: Confidence from CNN (0-1)
            fusion_method: "weighted" or "gating"
            final_threshold: Threshold for final decision
            verbose: Whether to print decision details
            
        Returns:
            Dictionary with decision details
        """
        if fusion_method == "weighted":
            final_confidence = AccidentDecisionFusion.weighted_fusion(
                yolo_confidence, cnn_confidence
            )
            confirmed = final_confidence >= final_threshold
            gate_passed = True
            
        elif fusion_method == "gating":
            final_confidence, gate_passed = AccidentDecisionFusion.gating_fusion(
                yolo_confidence, cnn_confidence
            )
            confirmed = gate_passed and final_confidence >= final_threshold
            
        else:
            raise ValueError(f"Unknown fusion method: {fusion_method}")
        
        if verbose:
            print(f"\n📊 DECISION FUSION")
            print(f"   YOLO confidence: {yolo_confidence:.3f}")
            print(f"   CNN confidence:  {cnn_confidence:.3f}")
            print(f"   Final confidence: {final_confidence:.3f}")
            print(f"   Threshold: {final_threshold:.3f}")
            if fusion_method == "gating":
                print(f"   CNN gate: {'PASSED ✅' if gate_passed else 'REJECTED ❌'}")
            print(f"   {'🚨 ACCIDENT CONFIRMED' if confirmed else '✋ FALSE POSITIVE REJECTED'}")
        
        return {
            'yolo_confidence': yolo_confidence,
            'cnn_confidence': cnn_confidence,
            'final_confidence': final_confidence,
            'confirmed': confirmed,
            'gate_passed': gate_passed,
            'fusion_method': fusion_method
        }


# Example usage function
def example_verification_pipeline():
    """
    Example showing how to integrate CNN verifier into existing YOLO pipeline.
    """
    print("="*60)
    print("CNN ACCIDENT VERIFICATION - Example Pipeline")
    print("="*60)
    
    # Initialize verifier
    verifier = CNNAccidentVerifier(
        model_path="../models/tf_lite_model.tflite",
        confidence_threshold=0.65,
        num_verification_frames=5
    )
    
    # Simulate YOLO detection
    candidate_vehicle = {
        'id': 42,
        'stopped_time': 4.5,
        'speed': 0.3
    }
    
    print("\n1️⃣ YOLO DETECTION (Stage 1)")
    print(f"   Vehicle ID {candidate_vehicle['id']} flagged as candidate")
    print(f"   Stopped time: {candidate_vehicle['stopped_time']:.1f}s")
    print(f"   Speed: {candidate_vehicle['speed']:.1f} px/frame")
    
    # Compute YOLO confidence
    yolo_conf = AccidentDecisionFusion.compute_yolo_confidence(candidate_vehicle)
    
    # Simulate frame buffer (in real code, this comes from clip_writer)
    # Here we just show the structure
    print("\n2️⃣ FRAME EXTRACTION")
    print("   Extracting frames from ring buffer...")
    print("   (In real implementation, uses actual frame_buffer from clip_writer)")
    
    # In real code:
    # verification_result = verifier.verify_accident(
    #     frame_buffer=buffer,  # from clip_writer
    #     post_event_frames=post_frames,
    #     fps=FPS
    # )
    
    # Simulate CNN result for demo
    print("\n3️⃣ CNN VERIFICATION (Stage 2)")
    simulated_cnn_conf = 0.82
    print(f"   CNN confidence: {simulated_cnn_conf:.3f}")
    
    # Final decision fusion
    print("\n4️⃣ DECISION FUSION")
    decision = AccidentDecisionFusion.make_decision(
        yolo_confidence=yolo_conf,
        cnn_confidence=simulated_cnn_conf,
        fusion_method="weighted",
        final_threshold=0.65
    )
    
    return decision


if __name__ == "__main__":
    example_verification_pipeline()
