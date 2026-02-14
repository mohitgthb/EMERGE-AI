#!/bin/bash
# EMERGE AI - Accident Detection API Startup Script for Linux/Mac

echo "========================================"
echo "EMERGE AI - Accident Detection API"
echo "========================================"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python3 is not installed"
    echo "Please install Python 3.8+ from python.org"
    exit 1
fi

echo "[1/3] Checking dependencies..."

# Check if FastAPI is installed
python3 -c "import fastapi" &> /dev/null
if [ $? -ne 0 ]; then
    echo "FastAPI not found. Installing dependencies..."
    pip3 install -r api_requirements.txt
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install dependencies"
        exit 1
    fi
else
    echo "Dependencies OK"
fi

echo ""
echo "[2/3] Checking model files..."

# Check if YOLO model exists
if [ ! -f "../yolov8s.pt" ]; then
    echo "WARNING: YOLO model not found at ../yolov8s.pt"
    echo "The server may fail to start without the model file."
    echo ""
fi

# Check if CNN model exists
if [ ! -f "../models/accident_detection_model.pth" ]; then
    echo "WARNING: CNN model not found at ../models/accident_detection_model.pth"
    echo "CNN verification will be disabled."
    echo ""
fi

echo ""
echo "[3/3] Starting API server..."
echo ""
echo "Server will be available at: http://localhost:8000"
echo "API Documentation: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop the server"
echo "========================================"
echo ""

# Start the server
python3 api_server.py
