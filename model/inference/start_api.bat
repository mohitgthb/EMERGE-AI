@echo off
REM EMERGE AI - Accident Detection API Startup Script for Windows

echo ========================================
echo EMERGE AI - Accident Detection API
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from python.org
    pause
    exit /b 1
)

echo [1/3] Checking dependencies...

REM Check if FastAPI is installed
python -c "import fastapi" >nul 2>&1
if %errorlevel% neq 0 (
    echo FastAPI not found. Installing dependencies...
    pip install -r api_requirements.txt
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo Dependencies OK
)

echo.
echo [2/3] Checking model files...

REM Check if YOLO model exists
if not exist "..\yolov8s.pt" (
    echo WARNING: YOLO model not found at ../yolov8s.pt
    echo The server may fail to start without the model file.
    echo.
)

REM Check if CNN model exists
if not exist "..\models\accident_detection_model.pth" (
    echo WARNING: CNN model not found at ../models/accident_detection_model.pth
    echo CNN verification will be disabled.
    echo.
)

echo.
echo [3/3] Starting API server...
echo.
echo Server will be available at: http://localhost:8000
echo API Documentation: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

REM Start the server
python api_server.py

pause
