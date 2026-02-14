# EMERGE AI - Accident Detection API Dockerfile

FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY api_requirements.txt .
COPY requirements.txt ../requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r api_requirements.txt && \
    pip install --no-cache-dir -r ../requirements.txt

# Copy application files
COPY . .

# Copy model files from parent directory
COPY ../yolov8s.pt ../yolov8s.pt
COPY ../models ../models

# Expose API port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:8000/health')" || exit 1

# Run the API server
CMD ["python", "api_server.py"]
