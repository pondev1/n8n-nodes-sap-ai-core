// n8nDefaultFailedAttemptHandler.ts

const STATUS_NO_RETRY = [
	400, // Bad Request
	401, // Unauthorized
	402, // Payment Required
	403, // Forbidden
	404, // Not Found
	405, // Method Not Allowed
	406, // Not Acceptable
	407, // Proxy Authentication Required
	409, // Conflict
];

export const n8nDefaultFailedAttemptHandler = (error: any): void => {
	if (
		error?.message?.startsWith?.('Cancel') ||
		error?.message?.startsWith?.('AbortError') ||
		error?.name === 'AbortError'
	) {
		throw error;
	}

	if (error?.code === 'ECONNABORTED') {
		throw error;
	}

	const status = error?.response?.status ?? error?.status;
	if (status && STATUS_NO_RETRY.includes(+status)) {
		throw error;
	}
};