// n8nLlmFailedAttemptHandler.ts
import { NodeApiError } from 'n8n-workflow';
import type { ISupplyDataFunctions } from 'n8n-workflow';
import { n8nDefaultFailedAttemptHandler } from './n8nDefaultFailedAttemptHandler';

export const makeN8nLlmFailedAttemptHandler = (
	ctx: ISupplyDataFunctions,
	handler?: (error: any) => void
) => {
	return (error: any) => {
		try {
			handler?.(error);
			n8nDefaultFailedAttemptHandler(error);
		} catch (e: any) {
			const apiError = new NodeApiError(ctx.getNode(), e, {
				functionality: 'configuration-node',
			});
			throw apiError;
		}

		if (error?.retriesLeft > 0) {
			return;
		}

		const apiError = new NodeApiError(ctx.getNode(), error, {
			functionality: 'configuration-node',
		});
		throw apiError;
	};
};