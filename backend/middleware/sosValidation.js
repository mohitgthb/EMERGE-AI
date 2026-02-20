const prisma = require("../config/db");

const RATE_LIMIT_WINDOW = 5 * 60 * 1000;
const MAX_SOS_COUNT = 3;

exports.captureDeviceInfo = async (req, res, next) => {
  const deviceIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const deviceFingerprint = `${deviceIP}_${userAgent}`;

  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW);

  try {
    const recentSOS = await prisma.sOSEvent.findMany({
      where: {
        deviceFingerprint,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (recentSOS.length > 0 && recentSOS[0].sosCount >= MAX_SOS_COUNT) {
      const timeSinceLastSOS = now.getTime() - recentSOS[0].createdAt.getTime();
      const retryAfter = Math.ceil((RATE_LIMIT_WINDOW - timeSinceLastSOS) / 1000);
      
      return res.status(429).json({
        message: "Rate limit exceeded. Too many SOS requests.",
        retryAfter,
      });
    }

    req.deviceInfo = {
      deviceIP,
      userAgent,
      deviceFingerprint,
    };

    next();
  } catch (error) {
    console.error("Device info capture error:", error);
    res.status(500).json({ message: "Validation failed", error: error.message });
  }
};

