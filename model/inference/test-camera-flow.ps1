# ============================================================================
# EMERGE AI - Camera Detection Flow Test Script
# ============================================================================
# This script tests the complete backend-orchestrated camera detection flow
# ============================================================================

$BACKEND_URL = "http://localhost:5000"
$AI_SERVICE_URL = "http://localhost:8000"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "EMERGE AI - Camera Detection Flow Test" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: Check if services are running
Write-Host "1. Checking services..." -ForegroundColor Yellow
try {
    $backendHealth = Invoke-RestMethod -Uri "$BACKEND_URL/api/cameras" -Method GET -ErrorAction Stop
    Write-Host "   ✓ Backend is running" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Backend is NOT running. Start it with: npm start" -ForegroundColor Red
    exit 1
}

try {
    $aiHealth = Invoke-RestMethod -Uri "$AI_SERVICE_URL/health" -ErrorAction Stop
    Write-Host "   ✓ AI Service is running" -ForegroundColor Green
} catch {
    Write-Host "   ✗ AI Service is NOT running. Start it with: python api_server.py" -ForegroundColor Red
    exit 1
}

# Test 2: List cameras
Write-Host "`n2. Listing cameras in database..." -ForegroundColor Yellow
try {
    $cameras = Invoke-RestMethod -Uri "$BACKEND_URL/api/cameras" -Method GET
    Write-Host "   Found $($cameras.cameras.Count) cameras:" -ForegroundColor Green
    foreach ($cam in $cameras.cameras) {
        $status = if ($cam.isActive) { "✓" } else { "✗" }
        Write-Host "   $status $($cam.cameraId) - $($cam.name)" -ForegroundColor $(if ($cam.isActive) { "Green" } else { "Gray" })
        Write-Host "     Location: $($cam.latitude), $($cam.longitude)" -ForegroundColor Gray
        Write-Host "     Source: $($cam.rtspUrl)$($cam.videoPath)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ✗ Failed to list cameras: $_" -ForegroundColor Red
    exit 1
}

# Test 3: Select camera for testing
Write-Host "`n3. Select test camera:" -ForegroundColor Yellow
Write-Host "   [1] Use webcam (device 0)" -ForegroundColor White
Write-Host "   [2] CAM_TEST_FILE (need to configure video path)" -ForegroundColor White
Write-Host "   [3] Custom camera ID" -ForegroundColor White
$choice = Read-Host "   Enter choice (1-3)"

$testCameraId = ""
$needsUpdate = $false

switch ($choice) {
    "1" {
        Write-Host "`n   Setting up webcam test camera..." -ForegroundColor Yellow
        
        # Update CAM_TEST_FILE to use webcam
        try {
            $updateBody = @{
                videoPath = "0"
                streamType = "WEBCAM"
                rtspUrl = $null
            } | ConvertTo-Json
            
            $updated = Invoke-RestMethod -Uri "$BACKEND_URL/api/cameras/code/CAM_TEST_FILE" `
                -Method PUT -Body $updateBody -ContentType "application/json"
            
            Write-Host "   ✓ Updated CAM_TEST_FILE to use webcam" -ForegroundColor Green
            $testCameraId = "CAM_TEST_FILE"
        } catch {
            Write-Host "   ✗ Failed to update camera: $_" -ForegroundColor Red
            exit 1
        }
    }
    "2" {
        Write-Host "`n   Enter video file path (e.g., D:\videos\test.mp4):" -ForegroundColor Yellow
        $videoPath = Read-Host "   Path"
        
        if (-not (Test-Path $videoPath)) {
            Write-Host "   ✗ File not found: $videoPath" -ForegroundColor Red
            exit 1
        }
        
        try {
            $updateBody = @{
                videoPath = $videoPath
                streamType = "FILE"
                rtspUrl = $null
            } | ConvertTo-Json
            
            $updated = Invoke-RestMethod -Uri "$BACKEND_URL/api/cameras/code/CAM_TEST_FILE" `
                -Method PUT -Body $updateBody -ContentType "application/json"
            
            Write-Host "   ✓ Updated CAM_TEST_FILE with video file" -ForegroundColor Green
            $testCameraId = "CAM_TEST_FILE"
        } catch {
            Write-Host "   ✗ Failed to update camera: $_" -ForegroundColor Red
            exit 1
        }
    }
    "3" {
        $testCameraId = Read-Host "   Enter camera ID"
    }
    default {
        Write-Host "   ✗ Invalid choice" -ForegroundColor Red
        exit 1
    }
}

# Test 4: Get camera details
Write-Host "`n4. Fetching camera details..." -ForegroundColor Yellow
try {
    $camera = Invoke-RestMethod -Uri "$BACKEND_URL/api/cameras/code/$testCameraId" -Method GET
    Write-Host "   Camera: $($camera.camera.name)" -ForegroundColor Green
    Write-Host "   Location: $($camera.camera.latitude), $($camera.camera.longitude)" -ForegroundColor Gray
    Write-Host "   Stream Type: $($camera.camera.streamType)" -ForegroundColor Gray
    Write-Host "   Source: $($camera.camera.rtspUrl)$($camera.camera.videoPath)" -ForegroundColor Gray
    Write-Host "   Active: $($camera.camera.isActive)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Camera not found: $testCameraId" -ForegroundColor Red
    exit 1
}

# Test 5: Trigger detection
Write-Host "`n5. Trigger detection..." -ForegroundColor Yellow
$duration = Read-Host "   Enter duration in seconds (default: 10)"
if ([string]::IsNullOrWhiteSpace($duration)) {
    $duration = 10
}

Write-Host "   Starting detection for $duration seconds..." -ForegroundColor Yellow
Write-Host "   This may take a while. Press Ctrl+C to cancel.`n" -ForegroundColor Gray

try {
    $detectionBody = @{
        duration = [int]$duration
    } | ConvertTo-Json
    
    $result = Invoke-RestMethod -Uri "$BACKEND_URL/api/detections/camera/$testCameraId" `
        -Method POST -Body $detectionBody -ContentType "application/json"
    
    Write-Host "`n   ✓ Detection completed!" -ForegroundColor Green
    Write-Host "`n   Results:" -ForegroundColor Cyan
    Write-Host "   ========" -ForegroundColor Cyan
    $result | ConvertTo-Json -Depth 5 | Write-Host
    
    if ($result.aiResponse.accidents_detected -gt 0) {
        Write-Host "`n   🚨 Accidents detected: $($result.aiResponse.accidents_detected)" -ForegroundColor Red
        Write-Host "   Check the accidents folder for video clips" -ForegroundColor Yellow
    } else {
        Write-Host "`n   ✓ No accidents detected" -ForegroundColor Green
    }
    
} catch {
    Write-Host "`n   ✗ Detection failed!" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $errorBody = $reader.ReadToEnd()
        Write-Host "   Details: $errorBody" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Complete" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan
