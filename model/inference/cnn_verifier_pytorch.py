"""
PyTorch CNN Verification Module for Accident Detection

This module provides a PyTorch-based verification layer that runs ONLY when 
YOLO+tracking flags a candidate accident. It uses a PyTorch CNN model to verify
whether the candidate is a true accident or a false positive.

Architecture:
    YOLO + tracking + rules → candidate event → CNN verification → final decision
"""

import torch
import torch.nn as nn
import torchvision.transforms as transforms
import torchvision.models as models
import numpy as np
import cv2
from typing import List, Tuple, Dict
from collections import deque, OrderedDict


def create_default_cnn_model(num_classes=2, input_size=(224, 224), architecture='resnet50'):
    """
    Create a default CNN architecture (ResNet50-based by default).
    Used when loading state_dict without model definition.
    
    Args:
        num_classes: Number of output classes (2 for binary classification with softmax)
        input_size: Expected input size
        architecture: Model architecture to use ('resnet18', 'resnet50', etc.)
        
    Returns:
        PyTorch model
    """
    if architecture == 'resnet50':
        model = models.resnet50(weights=None)
    elif architecture == 'resnet18':
        model = models.resnet18(weights=None)
    elif architecture == 'resnet34':
        model = models.resnet34(weights=None)
    else:
        model = models.resnet50(weights=None)
    
    # Modify final layer for accident detection
    num_features = model.fc.in_features
    model.fc = nn.Linear(num_features, num_classes)
    
    return model


class CNNAccidentVerifier:
    """
    PyTorch-based accident verifier.
    
    This class encapsulates the CNN verification logic and provides
    methods to verify accident candidates flagged by YOLO logic.
    """
    
    def __init__(
        self,
        model_path: str = "models/accident_detection_model.pth",
        input_size: Tuple[int, int] = (224, 224),
        confidence_threshold: float = 0.65,
        num_verification_frames: int = 5
    ):
        """
        Initialize the PyTorch CNN verifier.
        
        Args:
            model_path: Path to the PyTorch model file (.pth)
            input_size: Input image size (H, W)
            confidence_threshold: Minimum confidence for accident confirmation
            num_verification_frames: Number of frames to analyze
        """
        self.model_path = model_path
        self.input_size = input_size
        self.confidence_threshold = confidence_threshold
        self.num_verification_frames = num_verification_frames
        
        # Device configuration
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # Load PyTorch model
        try:
            checkpoint = torch.load(model_path, map_location=self.device)
            
            # Initialize defaults
            num_classes = 2
            architecture = 'resnet50'
            
            # Check if it's a full model or just state_dict
            if isinstance(checkpoint, nn.Module):
                # Full model saved
                self.model = checkpoint
                # Try to extract num_classes from model
                if hasattr(self.model, 'fc'):
                    num_classes = self.model.fc.out_features
            elif isinstance(checkpoint, (dict, OrderedDict)):
                # State_dict saved - need to reconstruct model
                if 'state_dict' in checkpoint:
                    state_dict = checkpoint['state_dict']
                else:
                    state_dict = checkpoint
                
                # Try to infer architecture and output size from layer shapes
                num_classes = 2  # Default
                architecture = 'resnet50'  # Default
                
                # Detect architecture from layer4 output channels
                if 'layer4.0.downsample.1.weight' in state_dict:
                    channels = state_dict['layer4.0.downsample.1.weight'].shape[0]
                    if channels == 2048:
                        architecture = 'resnet50'  # or resnet101/152
                    elif channels == 512:
                        architecture = 'resnet18'  # or resnet34
                
                # Detect num_classes from fc layer
                if 'fc.weight' in state_dict:
                    num_classes = state_dict['fc.weight'].shape[0]
                elif 'fc.bias' in state_dict:
                    num_classes = state_dict['fc.bias'].shape[0]
                
                # Create model architecture
                self.model = create_default_cnn_model(
                    num_classes=num_classes, 
                    input_size=input_size,
                    architecture=architecture
                )
                
                # Load weights
                self.model.load_state_dict(state_dict, strict=True)
            else:
                raise ValueError(f"Unexpected checkpoint format: {type(checkpoint)}")
            
            self.model.to(self.device)
            self.model.eval()  # Set to evaluation mode
            
            # Store num_classes for inference
            self.num_classes = num_classes
            
            print(f"✅ PyTorch model loaded from {model_path}")
            print(f"   Architecture: {architecture}")
            print(f"   Output classes: {self.num_classes}")
            print(f"   Device: {self.device}")
        except Exception as e:
            raise RuntimeError(f"Failed to load PyTorch model: {e}")
        
        # Define preprocessing transforms
        self.transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize(input_size),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], 
                               std=[0.229, 0.224, 0.225])
        ])
        
    def preprocess_frame(self, frame: np.ndarray) -> torch.Tensor:
        """
        Preprocess a single frame for PyTorch inference.
        
        Args:
            frame: Raw frame from OpenCV (BGR format, uint8)
            
        Returns:
            Preprocessed tensor ready for PyTorch inference [1, C, H, W]
        """
        # Convert BGR to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Apply transforms
        tensor = self.transform(frame_rgb)
        
        # Add batch dimension
        tensor = tensor.unsqueeze(0)
        
        return tensor.to(self.device)
    
    def run_inference(self, preprocessed_frame: torch.Tensor) -> float:
        """
        Run PyTorch inference on a single preprocessed frame.
        
        Args:
            preprocessed_frame: Preprocessed tensor [1, C, H, W]
            
        Returns:
            Accident probability (0.0 to 1.0)
        """
        with torch.no_grad():
            output = self.model(preprocessed_frame)
            
            # Handle different output formats
            if isinstance(output, torch.Tensor):
                # If output is 2-class logits, apply softmax and take accident class
                if output.shape[-1] == 2:
                    probability = torch.softmax(output, dim=1)[0, 1].item()  # Class 1 = accident
                # If output is single logit, apply sigmoid
                elif output.shape[-1] == 1:
                    probability = torch.sigmoid(output).item()
                else:
                    # Fallback
                    probability = torch.sigmoid(output[0]).item()
            else:
                raise ValueError(f"Unexpected model output type: {type(output)}")
        
        return probability
    
    def extract_verification_frames(
        self,
        frame_buffer: deque,
        fps: int = 10
    ) -> List[np.ndarray]:
        """
        Extract frames from ring buffer for verification.
        
        Extracts frames at key temporal offsets relative to the event:
        - 2 seconds before
        - 1 second before  
        - Event frame (current)
        
        Args:
            frame_buffer: Ring buffer containing recent frames
            fps: Frames per second of the video
            
        Returns:
            List of extracted frames
        """
        if len(frame_buffer) == 0:
            return []
        
        buffer_size = len(frame_buffer)
        frames_list = list(frame_buffer)
        
        # Event frame is the most recent
        event_idx = buffer_size - 1
        
        # Calculate target frame indices
        offsets = [
            -2 * fps,  # 2 seconds before
            -1 * fps,  # 1 second before
            0          # Event frame
        ]
        
        verification_frames = []
        for offset in offsets:
            idx = event_idx + offset
            if 0 <= idx < buffer_size:
                verification_frames.append(frames_list[idx])
        
        # Ensure we have the event frame at minimum
        if len(verification_frames) == 0 and buffer_size > 0:
            verification_frames.append(frames_list[-1])
        
        return verification_frames[:self.num_verification_frames]
    
    def aggregate_predictions(
        self,
        predictions: List[float],
        method: str = "weighted_average"
    ) -> float:
        """
        Aggregate multiple frame predictions into a single confidence score.
        
        Args:
            predictions: List of per-frame probabilities
            method: Aggregation method ("average", "weighted_average", "max")
            
        Returns:
            Aggregated confidence score
        """
        if not predictions:
            return 0.0
        
        if method == "average":
            return np.mean(predictions)
        
        elif method == "weighted_average":
            # Give more weight to recent frames
            weights = np.linspace(0.5, 1.0, len(predictions))
            weights = weights / weights.sum()
            return np.average(predictions, weights=weights)
        
        elif method == "max":
            return np.max(predictions)
        
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
        Verify if a candidate accident is real using CNN.
        
        Args:
            frame_buffer: Ring buffer of recent frames
            post_event_frames: Optional frames captured after the event
            fps: Frames per second
            aggregation_method: How to combine frame predictions
            verbose: Print detailed output
            
        Returns:
            Dictionary with verification results
        """
        # Extract pre-event frames
        verification_frames = self.extract_verification_frames(frame_buffer, fps)
        
        # Add post-event frames if provided
        if post_event_frames:
            verification_frames.extend(post_event_frames[:2])
        
        # Limit to max frames
        verification_frames = verification_frames[:self.num_verification_frames]
        
        if verbose:
            print(f"   📹 Analyzing {len(verification_frames)} frames...")
        
        # Run inference on each frame
        predictions = []
        for i, frame in enumerate(verification_frames):
            preprocessed = self.preprocess_frame(frame)
            prob = self.run_inference(preprocessed)
            predictions.append(prob)
            
            if verbose:
                print(f"      Frame {i+1}: {prob:.3f}")
        
        # Aggregate predictions
        final_confidence = self.aggregate_predictions(predictions, aggregation_method)
        
        confirmed = final_confidence >= self.confidence_threshold
        
        if verbose:
            print(f"   📊 CNN Confidence: {final_confidence:.3f}")
            print(f"   {'✅ CONFIRMED' if confirmed else '❌ REJECTED'}")
        
        return {
            'confirmed': confirmed,
            'cnn_confidence': final_confidence,
            'frame_predictions': predictions,
            'num_frames': len(verification_frames)
        }


class AccidentDecisionFusion:
    """
    Fuses YOLO-based confidence with CNN confidence to make final decision.
    """
    
    @staticmethod
    def compute_yolo_confidence(vehicle: Dict) -> float:
        """
        Compute YOLO confidence based on stopped time and speed.
        
        Args:
            vehicle: Vehicle dict with 'stopped_time' and 'speed'
            
        Returns:
            Confidence score (0.0 to 1.0)
        """
        stopped_time = vehicle.get('stopped_time', 0)
        speed = vehicle.get('speed', 0)
        
        # Stopped time contribution (sigmoid curve)
        time_factor = 1 / (1 + np.exp(-(stopped_time - 3)))
        
        # Speed contribution (inverse relationship)
        speed_factor = 1 / (1 + speed)
        
        # Weighted combination
        confidence = 0.7 * time_factor + 0.3 * speed_factor
        
        return float(np.clip(confidence, 0.0, 1.0))
    
    @staticmethod
    def make_decision(
        yolo_confidence: float,
        cnn_confidence: float,
        fusion_method: str = "weighted",
        final_threshold: float = 0.65,
        verbose: bool = True
    ) -> Dict:
        """
        Make final accident decision by fusing YOLO and CNN confidences.
        
        Args:
            yolo_confidence: Confidence from YOLO logic
            cnn_confidence: Confidence from CNN verification
            fusion_method: "weighted", "average", or "min"
            final_threshold: Threshold for final decision
            verbose: Print output
            
        Returns:
            Decision dictionary
        """
        if fusion_method == "weighted":
            # Give more weight to CNN (it's more reliable)
            final_confidence = 0.4 * yolo_confidence + 0.6 * cnn_confidence
        
        elif fusion_method == "average":
            final_confidence = (yolo_confidence + cnn_confidence) / 2
        
        elif fusion_method == "min":
            # Conservative: both must agree
            final_confidence = min(yolo_confidence, cnn_confidence)
        
        else:
            raise ValueError(f"Unknown fusion method: {fusion_method}")
        
        confirmed = final_confidence >= final_threshold
        
        if verbose:
            print(f"   🔗 YOLO: {yolo_confidence:.3f} | CNN: {cnn_confidence:.3f}")
            print(f"   🎯 Final: {final_confidence:.3f} (threshold: {final_threshold})")
        
        return {
            'confirmed': confirmed,
            'final_confidence': final_confidence,
            'yolo_confidence': yolo_confidence,
            'cnn_confidence': cnn_confidence
        }
