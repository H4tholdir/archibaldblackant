interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  iat: number;
  exp: number;
}

const JWT_REFRESH_CONFIG = {
  checkInterval: 5 * 60 * 1000,
  refreshThreshold: 30 * 60 * 1000,
  maxConsecutiveFailures: 3,
};

class JWTRefreshService {
  private intervalId: number | null = null;
  private isRefreshing = false;
  private consecutiveFailures = 0;

  start() {
    if (this.intervalId) {
      return;
    }

    console.log('[JWTRefresh] Starting auto-refresh service');

    this.consecutiveFailures = 0;
    this.checkAndRefresh();

    this.intervalId = window.setInterval(
      () => this.checkAndRefresh(),
      JWT_REFRESH_CONFIG.checkInterval,
    );

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      console.log('[JWTRefresh] Tab visible, checking token');
      this.checkAndRefresh();
    }
  };

  private async checkAndRefresh() {
    try {
      const token = localStorage.getItem('archibald_jwt');
      if (!token) return;

      const payload = this.decodeJWT(token);
      if (!payload) return;

      const now = Date.now();
      const expiryTime = payload.exp * 1000;
      const timeUntilExpiry = expiryTime - now;
      const minutesUntilExpiry = Math.round(timeUntilExpiry / 1000 / 60);

      console.log(`[JWTRefresh] Token expires in ${minutesUntilExpiry} min`);

      if (timeUntilExpiry <= 0) {
        console.log('[JWTRefresh] Token expired, attempting refresh');
        const refreshed = await this.refreshToken();
        if (!refreshed) {
          this.redirectToLogin('token_expired');
        }
      } else if (timeUntilExpiry < JWT_REFRESH_CONFIG.refreshThreshold) {
        console.log('[JWTRefresh] Token expiring soon, refreshing');
        await this.refreshToken();
      }
    } catch (error) {
      console.error('[JWTRefresh] Error during refresh check:', error);
    }
  }

  private async refreshToken(): Promise<boolean> {
    if (this.isRefreshing) return false;

    this.isRefreshing = true;

    try {
      const token = localStorage.getItem('archibald_jwt');
      if (!token) return false;

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        console.log('[JWTRefresh] 401 from refresh endpoint, session lost');
        this.redirectToLogin('session_expired');
        return false;
      }

      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.token) {
        localStorage.setItem('archibald_jwt', data.token);
        this.consecutiveFailures = 0;
        console.log('[JWTRefresh] Token refreshed successfully');
        return true;
      }

      throw new Error('Refresh response invalid');
    } catch (error) {
      this.consecutiveFailures++;
      console.error(`[JWTRefresh] Refresh failed (${this.consecutiveFailures}/${JWT_REFRESH_CONFIG.maxConsecutiveFailures}):`, error);

      if (this.consecutiveFailures >= JWT_REFRESH_CONFIG.maxConsecutiveFailures) {
        console.log('[JWTRefresh] Max failures reached, redirecting to login');
        this.redirectToLogin('refresh_failed');
      }

      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  private redirectToLogin(reason: string) {
    this.stop();
    localStorage.removeItem('archibald_jwt');
    window.location.href = `/login?reason=${reason}`;
  }

  async forceRefresh() {
    await this.refreshToken();
  }

  private decodeJWT(token: string): JWTPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1]));
    } catch {
      return null;
    }
  }
}

export const jwtRefreshService = new JWTRefreshService();
