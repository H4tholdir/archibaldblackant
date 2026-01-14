/**
 * Biometric Authentication Service
 * Uses Web Authentication API (WebAuthn) for platform biometric unlock
 */

export interface BiometricCapability {
  available: boolean;
  platformLabel: string; // "Face ID / Touch ID", "Impronta digitale", etc.
}

export class BiometricAuth {
  /**
   * Check if biometric authentication is available on this device
   */
  async checkAvailability(): Promise<BiometricCapability> {
    // Check if WebAuthn is supported
    if (!window.PublicKeyCredential) {
      return { available: false, platformLabel: '' };
    }

    try {
      // Check if platform authenticator available (Face ID, Touch ID, fingerprint, etc.)
      const available =
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

      if (!available) {
        return { available: false, platformLabel: '' };
      }

      // Determine platform-specific label
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isAndroid = /Android/i.test(navigator.userAgent);

      let platformLabel = 'Biometrica';
      if (isIOS) {
        platformLabel = 'Face ID / Touch ID';
      } else if (isAndroid) {
        platformLabel = 'Impronta digitale';
      }

      return { available: isMobile, platformLabel };
    } catch (error) {
      console.error('Biometric availability check failed', error);
      return { available: false, platformLabel: '' };
    }
  }

  /**
   * Register biometric credential for user (called during PIN setup)
   */
  async registerCredential(
    userId: string,
    username: string
  ): Promise<string | null> {
    try {
      const challenge = this.generateChallenge();

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: new TextEncoder().encode(challenge),
          rp: {
            name: 'Archibald',
            id: window.location.hostname,
          },
          user: {
            id: new TextEncoder().encode(userId),
            name: username,
            displayName: username,
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }], // ES256
          authenticatorSelection: {
            authenticatorAttachment: 'platform', // Use platform authenticator (Touch ID, Face ID, etc.)
            userVerification: 'required',
          },
          timeout: 60000,
          attestation: 'none',
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        return null;
      }

      // Store credential ID (not the credential itself)
      const credentialId = this.arrayBufferToBase64(credential.rawId);
      return credentialId;
    } catch (error) {
      console.error('Biometric registration failed', error);
      return null;
    }
  }

  /**
   * Authenticate using biometric (returns deterministic key material for decryption)
   */
  async authenticate(
    _userId: string,
    credentialId: string
  ): Promise<Uint8Array | null> {
    try {
      const challenge = this.generateChallenge();

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: new TextEncoder().encode(challenge),
          rpId: window.location.hostname,
          allowCredentials: [
            {
              id: this.base64ToArrayBuffer(credentialId),
              type: 'public-key',
            },
          ],
          userVerification: 'required',
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!assertion || !assertion.response) {
        return null;
      }

      // Use authenticatorData as key material (deterministic per credential)
      const response = assertion.response as AuthenticatorAssertionResponse;
      const keyMaterial = new Uint8Array(response.authenticatorData);
      return keyMaterial;
    } catch (error) {
      console.error('Biometric authentication failed', error);
      return null;
    }
  }

  // Helper: generate challenge (for WebAuthn protocol)
  private generateChallenge(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
      ''
    );
  }

  // Helper: ArrayBuffer to Base64
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Helper: Base64 to ArrayBuffer
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

// Singleton instance
let instance: BiometricAuth | null = null;

export function getBiometricAuth(): BiometricAuth {
  if (!instance) {
    instance = new BiometricAuth();
  }
  return instance;
}
