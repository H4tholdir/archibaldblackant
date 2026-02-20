/**
 * Device ID Management
 *
 * Generates and persists a unique device identifier for multi-device sync.
 * Device ID is stored in localStorage and used to track which device made changes.
 */

const DEVICE_ID_KEY = "archibald_device_id";

/**
 * Get or generate device ID
 * Device ID is a UUID stored in localStorage
 */
export function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    // Generate new UUID
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

/**
 * Get human-readable device name based on user agent
 */
export function getDeviceName(): string {
  const ua = navigator.userAgent;

  // Mobile devices
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android.*Mobile/i.test(ua)) return "Android Phone";
  if (/Android/i.test(ua)) return "Android Tablet";

  // Desktop
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux";

  // Generic fallback
  if (/Mobile/i.test(ua)) return "Mobile";
  if (/Tablet/i.test(ua)) return "Tablet";

  return "Desktop";
}

/**
 * Get platform string (navigator.platform or fallback)
 */
export function getPlatform(): string {
  return navigator.platform || "Unknown";
}

