/**
 * JWT Refresh Service
 *
 * Background service that automatically refreshes JWT tokens before expiry.
 * Runs every 5 minutes and checks if token is close to expiration (< 30 min).
 * If so, calls /api/auth/refresh to get a new token.
 *
 * Benefits:
 * - Users never see "token expired" errors
 * - Seamless 8+ hour sessions without interruption
 * - Reduces friction for long work sessions
 */

// JWT payload interface (matches backend)
interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  iat: number;  // Issued at (seconds since epoch)
  exp: number;  // Expiry (seconds since epoch)
}

const JWT_REFRESH_CONFIG = {
  checkInterval: 5 * 60 * 1000,      // Check every 5 minutes
  refreshThreshold: 30 * 60 * 1000,  // Refresh if < 30 min to expiry
};

class JWTRefreshService {
  private intervalId: number | null = null;
  private isRefreshing = false;

  /**
   * Start background JWT monitoring
   * Checks token expiry every 5 minutes and refreshes if needed
   */
  start() {
    if (this.intervalId) {
      console.log('[JWTRefresh] Service already running');
      return;
    }

    console.log('🚀 [JWTRefresh] Starting auto-refresh service...');

    // Check immediately on start
    this.checkAndRefresh();

    // Then check every 5 minutes
    this.intervalId = window.setInterval(
      () => this.checkAndRefresh(),
      JWT_REFRESH_CONFIG.checkInterval
    );
  }

  /**
   * Stop background monitoring
   * Called on logout or when token is cleared
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[JWTRefresh] Service stopped');
    }
  }

  /**
   * Check JWT expiry and refresh if necessary
   * @private
   */
  private async checkAndRefresh() {
    try {
      // 1. Get current JWT token
      const token = localStorage.getItem('archibald_jwt');
      if (!token) {
        console.log('[JWTRefresh] No token found, skipping refresh check');
        return;
      }

      // 2. Decode JWT and extract expiry time
      const payload = this.decodeJWT(token);
      if (!payload) {
        console.log('[JWTRefresh] Could not decode token, skipping refresh');
        return;
      }

      const now = Date.now();
      const expiryTime = payload.exp * 1000;  // Convert to milliseconds
      const timeUntilExpiry = expiryTime - now;

      // Log expiry time for monitoring
      const minutesUntilExpiry = Math.round(timeUntilExpiry / 1000 / 60);
      console.log(`[JWTRefresh] Token expires in ${minutesUntilExpiry} minutes`);

      // 3. Check if token is close to expiry
      if (timeUntilExpiry < JWT_REFRESH_CONFIG.refreshThreshold && timeUntilExpiry > 0) {
        console.log('🔄 [JWTRefresh] Token expiring soon, refreshing...');
        await this.refreshToken();
      } else if (timeUntilExpiry <= 0) {
        console.log('⚠️  [JWTRefresh] Token already expired, redirecting to login...');
        localStorage.removeItem('archibald_jwt');
        window.location.href = '/login?reason=token_expired';
      }
    } catch (error) {
      console.error('❌ [JWTRefresh] Error during refresh check:', error);
      // Non-fatal: retry at next interval
    }
  }

  /**
   * Refresh JWT token via API
   * @private
   */
  private async refreshToken() {
    if (this.isRefreshing) {
      console.log('[JWTRefresh] Refresh already in progress, skipping...');
      return;
    }

    this.isRefreshing = true;

    try {
      const token = localStorage.getItem('archibald_jwt');
      if (!token) {
        throw new Error('No token found');
      }

      // Call refresh endpoint
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.token) {
        // Update token in localStorage
        localStorage.setItem('archibald_jwt', data.token);
        console.log('✅ [JWTRefresh] Token refreshed successfully');
      } else {
        throw new Error('Refresh response invalid');
      }
    } catch (error) {
      console.error('❌ [JWTRefresh] Refresh failed:', error);
      // Non-fatal: let natural token expiry handle it
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Force immediate refresh (for testing/debugging)
   */
  async forceRefresh() {
    console.log('🔄 [JWTRefresh] Forcing immediate refresh...');
    await this.refreshToken();
  }

  /**
   * Decode JWT token to extract payload
   * Uses simple Base64 decoding (no signature verification - done on backend)
   * @private
   */
  private decodeJWT(token: string): JWTPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = parts[1];
      const decoded = atob(payload);
      return JSON.parse(decoded);
    } catch (error) {
      console.error('[JWTRefresh] Failed to decode JWT:', error);
      return null;
    }
  }
}

// Singleton instance
export const jwtRefreshService = new JWTRefreshService();
