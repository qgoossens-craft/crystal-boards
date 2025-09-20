/**
 * Security utilities for handling sensitive data like API keys
 */

/**
 * Simple obfuscation for API keys in memory
 * This is not encryption, but prevents casual observation
 */
export class SecureStorage {
	private static readonly MARKER = 'OBF:';
	
	/**
	 * Obfuscate a sensitive string
	 */
	static obfuscate(value: string): string {
		if (!value || value.startsWith(this.MARKER)) {
			return value;
		}
		
		// Simple base64 encoding with a marker
		// This prevents casual observation but is not cryptographically secure
		const encoded = btoa(value);
		return `${this.MARKER}${encoded}`;
	}
	
	/**
	 * De-obfuscate a sensitive string
	 */
	static deobfuscate(value: string): string {
		if (!value || !value.startsWith(this.MARKER)) {
			return value;
		}
		
		try {
			const encoded = value.substring(this.MARKER.length);
			return atob(encoded);
		} catch (error) {
			console.error('Failed to deobfuscate value');
			return '';
		}
	}
	
	/**
	 * Mask an API key for display
	 */
	static maskApiKey(apiKey: string): string {
		if (!apiKey || apiKey.length < 8) {
			return apiKey;
		}
		
		const firstChars = apiKey.substring(0, 3);
		const lastChars = apiKey.substring(apiKey.length - 4);
		const maskedLength = apiKey.length - 7;
		const masked = '*'.repeat(Math.min(maskedLength, 20));
		
		return `${firstChars}${masked}${lastChars}`;
	}
	
	/**
	 * Validate OpenAI API key format
	 */
	static validateOpenAIKey(apiKey: string): boolean {
		if (!apiKey) return false;
		
		// OpenAI keys start with 'sk-' and are typically 51 characters
		// But we'll be lenient and just check the prefix
		return apiKey.startsWith('sk-') && apiKey.length > 20;
	}
	
	/**
	 * Clear sensitive data from memory
	 */
	static clearSensitiveData(obj: any, keys: string[]): void {
		for (const key of keys) {
			if (obj[key]) {
				// Overwrite with random data before deleting
				obj[key] = Math.random().toString(36);
				delete obj[key];
			}
		}
	}
}

/**
 * Rate limiter for API calls
 */
export class RateLimiter {
	private lastCall: number = 0;
	private callCount: number = 0;
	private readonly windowMs: number;
	private readonly maxCalls: number;
	
	constructor(maxCallsPerWindow: number = 10, windowMs: number = 60000) {
		this.maxCalls = maxCallsPerWindow;
		this.windowMs = windowMs;
	}
	
	/**
	 * Check if a call is allowed
	 */
	canCall(): boolean {
		const now = Date.now();
		
		// Reset window if needed
		if (now - this.lastCall > this.windowMs) {
			this.callCount = 0;
		}
		
		if (this.callCount >= this.maxCalls) {
			return false;
		}
		
		return true;
	}
	
	/**
	 * Record a call
	 */
	recordCall(): void {
		const now = Date.now();
		
		// Reset window if needed
		if (now - this.lastCall > this.windowMs) {
			this.callCount = 0;
		}
		
		this.callCount++;
		this.lastCall = now;
	}
	
	/**
	 * Get time until next available call
	 */
	timeUntilNextCall(): number {
		if (this.canCall()) {
			return 0;
		}
		
		const timeSinceWindow = Date.now() - this.lastCall;
		return Math.max(0, this.windowMs - timeSinceWindow);
	}
}