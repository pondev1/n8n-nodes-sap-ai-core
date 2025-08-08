import { IExecuteFunctions, NodeOperationError } from 'n8n-workflow';
import { logAiEvent } from './helpers';

/**
 * Extract parsed output from output parser
 */
export async function extractParsedOutput(
	ctx: IExecuteFunctions,
	outputParser: any,
	rawOutput: string
): Promise<any> {
	if (!outputParser || !rawOutput) {
		return rawOutput;
	}
	
	try {
		// Try to parse the output
		if (typeof outputParser.parse === 'function') {
			return await outputParser.parse(rawOutput);
		}
		
		// Fallback to direct parsing if no parse method
		if (typeof outputParser.parseResult === 'function') {
			return await outputParser.parseResult(rawOutput);
		}
		
		// If no parsing method available, return raw output
		return rawOutput;
		
	} catch (error) {
		logAiEvent(ctx, 'output-parsing-failed', {
			error: error instanceof Error ? error.message : String(error),
			rawOutput: rawOutput.substring(0, 200) // Log first 200 chars
		});
		
		// Return raw output if parsing fails
		return rawOutput;
	}
}

/**
 * Retry mechanism for operations
 */
export async function retryOperation<T>(
	operation: () => Promise<T>,
	maxRetries: number = 3,
	delay: number = 1000,
	backoff: number = 2
): Promise<T> {
	let lastError: Error = new Error('No attempts made');
	
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			
			if (attempt === maxRetries) {
				break;
			}
			
			// Wait before retry with exponential backoff
			await new Promise(resolve => setTimeout(resolve, delay * Math.pow(backoff, attempt - 1)));
		}
	}
	
	throw lastError;
}

/**
 * Timeout wrapper for promises
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			reject(new Error(`Operation timed out after ${timeoutMs}ms`));
		}, timeoutMs);
		
		promise
			.then(resolve)
			.catch(reject)
			.finally(() => clearTimeout(timeoutId));
	});
}

/**
 * Safe JSON parsing with fallback
 */
export function safeJsonParse(jsonString: string, fallback: any = null): any {
	try {
		return JSON.parse(jsonString);
	} catch (error) {
		console.warn('Failed to parse JSON:', error);
		return fallback;
	}
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}
	
	if (obj instanceof Date) {
		return new Date(obj.getTime()) as unknown as T;
	}
	
	if (Array.isArray(obj)) {
		return obj.map(item => deepClone(item)) as unknown as T;
	}
	
	const cloned = {} as T;
	for (const key in obj) {
		if (obj.hasOwnProperty(key)) {
			cloned[key] = deepClone(obj[key]);
		}
	}
	
	return cloned;
}

/**
 * Sanitize string for safe usage
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
	if (typeof input !== 'string') {
		return String(input);
	}
	
	// Remove control characters except newlines and tabs
	const sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
	
	// Truncate if too long
	return sanitized.length > maxLength ? sanitized.substring(0, maxLength) + '...' : sanitized;
}

/**
 * Format error for logging
 */
export function formatError(error: unknown): { message: string; stack?: string; name?: string } {
	if (error instanceof Error) {
		return {
			message: error.message,
			stack: error.stack,
			name: error.name
		};
	}
	
	return {
		message: String(error)
	};
}

/**
 * Check if value is empty (null, undefined, empty string, empty array, empty object)
 */
export function isEmpty(value: any): boolean {
	if (value == null) return true;
	if (typeof value === 'string') return value.trim() === '';
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === 'object') return Object.keys(value).length === 0;
	return false;
}

/**
 * Generate unique ID
 */
export function generateId(prefix: string = ''): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2);
	return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: NodeJS.Timeout;
	
	return (...args: Parameters<T>) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => func(...args), delay);
	};
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: any[]) => any>(
	func: T,
	limit: number
): (...args: Parameters<T>) => void {
	let inThrottle: boolean;
	
	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			func(...args);
			inThrottle = true;
			setTimeout(() => inThrottle = false, limit);
		}
	};
}

/**
 * Convert bytes to human readable format
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
	if (bytes === 0) return '0 Bytes';
	
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
	
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	
	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Convert milliseconds to human readable duration
 */
export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	
	if (hours > 0) {
		return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
	} else if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	} else {
		return `${seconds}s`;
	}
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string | null {
	try {
		const urlObj = new URL(url);
		return urlObj.hostname;
	} catch {
		return null;
	}
}

/**
 * Merge objects deeply
 */
export function mergeDeep(target: any, source: any): any {
	if (!source || typeof source !== 'object') {
		return target;
	}
	
	const result = { ...target };
	
	for (const key in source) {
		if (source.hasOwnProperty(key)) {
			if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
				result[key] = mergeDeep(result[key] || {}, source[key]);
			} else {
				result[key] = source[key];
			}
		}
	}
	
	return result;
}

/**
 * Create a promise that resolves after specified delay
 */
export function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert string to camelCase
 */
export function toCamelCase(str: string): string {
	return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
		return index === 0 ? word.toLowerCase() : word.toUpperCase();
	}).replace(/\s+/g, '');
}

/**
 * Convert string to snake_case
 */
export function toSnakeCase(str: string): string {
	return str.replace(/\W+/g, ' ')
		.split(/ |\B(?=[A-Z])/)
		.map(word => word.toLowerCase())
		.join('_');
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number, ellipsis: string = '...'): string {
	if (text.length <= maxLength) return text;
	return text.substring(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
	return process.env.NODE_ENV === 'development';
}

/**
 * Safe property access with default value
 */
export function getProp<T>(obj: any, path: string, defaultValue: T): T {
	const keys = path.split('.');
	let current = obj;
	
	for (const key of keys) {
		if (current == null || !(key in current)) {
			return defaultValue;
		}
		current = current[key];
	}
	
	return current ?? defaultValue;
}