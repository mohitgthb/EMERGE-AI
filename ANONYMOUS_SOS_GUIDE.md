# Anonymous SOS System - Implementation Guide

## ✅ System Overview

The SOS system is now **fully anonymous** - no registration required. Users can:
1. Access the SOS page directly
2. Click emergency type
3. Optionally capture image of emergency
4. Send SOS with GPS location + device tracking

## 🔧 Key Changes

### 1. **Removed User Registration**
- ❌ Deleted `SOSUser` model
- ❌ Removed registration endpoints
- ✅ Direct SOS access for anyone

### 2. **Anonymous Device Tracking**
SOSEvent now captures:
- `deviceIP` - IP address
- `deviceMAC` - MAC address (if available)
- `userAgent` - Browser/device info
- `deviceFingerprint` - Unique identifier (IP + UserAgent hash)
- `imageUrl` - Emergency image path

### 3. **Rate Limiting**
- Tracks by `deviceFingerprint`
- **3 SOS per 5 minutes** per device
- Prevents spam while allowing genuine emergencies

### 4. **Image Upload**
- Optional emergency photo capture
- Stored in `/uploads` folder
- Validated by AI or operators
- Max file size: 10MB
- Formats: JPEG, PNG, GIF, WebP

## 📍 User Flow

```
1. User visits /sos-emergency.html
2. System auto-captures:
   ✓ GPS location (with permission)
   ✓ Device IP
   ✓ Device fingerprint
3. User selects emergency type (Medical/Safety/Fire/Accident)
4. (Optional) User captures emergency image via camera
5. Click "SEND SOS" button
6. Backend:
   - Rate limit check
   - Create SOSEvent
   - If NO image → Auto-dispatch
   - If image → Queue for verification
7. Operator/AI verifies image
8. Dispatch emergency responder
```

## 🗄️ Database Schema

```prisma
model SOSEvent {
  latitude          Float
  longitude         Float
  emergencyType     String    // MEDICAL | SAFETY | FIRE | ACCIDENT
  severity          String
  
  imageUrl          String?   // Emergency image
  deviceIP          String?
  deviceMAC         String?
  userAgent         String?
  deviceFingerprint String?
  
  isVerified        Boolean
  verificationMethod String?  // AI | MANUAL
  status            String    // PENDING | CONFIRMED | REJECTED | ESCALATED
  
  sosCount          Int       // For rate limiting
  lastSOSAt         DateTime?
  createdAt         DateTime
}
```

## 🔌 API Endpoints

### POST `/api/sos`
**Anonymous SOS trigger with optional image**

**Headers:** (auto-captured)
- `x-forwarded-for` or `remoteAddress` → deviceIP
- `user-agent` → userAgent

**Body (multipart/form-data):**
```json
{
  "latitude": 28.7041,
  "longitude": 77.1025,
  "emergencyType": "MEDICAL",
  "severity": "HIGH",
  "deviceMAC": "optional-mac-address",
  "emergencyImage": <file> // optional
}
```

**Response:**
```json
{
  "message": "SOS triggered and help dispatched",
  "sosEventId": "uuid",
  "dispatch": { ... }
}
```

### POST `/api/sos/:sosEventId/verify`
**Operator verification**
```json
{
  "isConfirmed": true,
  "notes": "Verified real emergency"
}
```

### POST `/api/sos/:sosEventId/escalate`
**Escalate to critical priority**

### GET `/api/sos`
**List all SOS events**

Query params: `?status=PENDING&emergencyType=MEDICAL`

## 🎨 Frontend

**SOS Page:** `/sos-emergency.html`

Features:
- 📍 Auto GPS location detection
- 🖥️ Device IP display
- 📸 Camera capture (with environment/rear camera preference)
- 🎯 Emergency type selector (Medical/Safety/Fire/Accident)
- 🚨 Big red SOS button
- ✅ Status feedback
- 🔄 Image retake option

## 🔒 Security Features

1. **Rate Limiting**: 3 SOS/5min per device fingerprint
2. **Device Tracking**: IP, MAC, UserAgent for accountability
3. **Image Validation**: Manual or AI verification before dispatch
4. **Location Requirement**: GPS mandatory for SOS
5. **File Upload Security**: 
   - Type validation (images only)
   - Size limit (10MB)
   - Sanitized filenames

## 🚀 Deployment

1. Migration applied: `20260217081632_anonymous_sos_with_image`
2. Prisma Client regenerated
3. Multer installed for image uploads
4. Static `/uploads` route enabled

## 📊 Operator Dashboard Integration

SOS events with images appear in:
- `/api/emergency-queue` (if image needs verification)
- Real-time Socket.IO events: `SOS_TRIGGERED`, `SOS_CONFIRMED`

Operators can:
1. View SOS image
2. See device info (IP, location, fingerprint)
3. CONFIRM → Dispatch responder
4. REJECT → Dismiss false alarm
5. ESCALATE → Critical priority dispatch

## 🧪 Testing

Visit: `http://localhost:5000/sos-emergency.html`

1. Allow location access
2. Select emergency type
3. Optionally capture image
4. Click SOS
5. Check backend logs for dispatch

## 📝 Notes

- No user accounts needed
- Anonymous but trackable by device
- Images stored in `backend/uploads/`
- Auto-dispatch if no image, queued if image present
- Rate limiting prevents abuse
