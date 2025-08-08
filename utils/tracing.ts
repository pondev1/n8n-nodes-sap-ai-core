import { IExecuteFunctions } from 'n8n-workflow';

export function getTracingConfig(context: IExecuteFunctions): any {
	// Return empty config for now - tracing is optional
	return {
		tags: ['sap-ai-core-llm'],
	};
}