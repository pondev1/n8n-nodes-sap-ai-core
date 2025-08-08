import {
	ISupplyDataFunctions,
	ILoadOptionsFunctions,
	INodeType,
	INodeTypeDescription,
	INodeListSearchResult,
	NodeConnectionType,
	NodeOperationError,
} from 'n8n-workflow';

// Import required n8n LangChain integration components
import { N8nLlmTracing } from '../SapAiCoreChatModel/N8nLlmTracing';
import { makeN8nLlmFailedAttemptHandler } from '../SapAiCoreChatModel/n8nLlmFailedAttemptHandler';

class SapAiCoreChatModel implements INodeType {
	methods = {
		listSearch: {
			searchModels: async function(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
				// Return static list of available models for SAP AI Core
				return {
					results: [
						{
							name: 'GPT-4o Mini',
							value: 'gpt-4o-mini',
						},
						{
							name: 'GPT-4o',
							value: 'gpt-4o',
						},
						{
							name: 'GPT-4',
							value: 'gpt-4',
						},
						{
							name: 'GPT-3.5 Turbo',
							value: 'gpt-3.5-turbo',
						},
					],
				};
			},
		},
	};

	description: INodeTypeDescription = {
		displayName: 'SAP AI Core Chat Model',
		name: 'sapAiCoreChatModel',
		icon: 'file:sapaicore.svg',
		group: ['transform'],
		version: 1,
		description: 'For advanced usage with an AI agent or chain',
		defaults: {
			name: 'SAP AI Core Chat Model',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://help.sap.com/docs/sap-ai-core',
					},
				],
			},
		},
		inputs: [],
		outputs: [NodeConnectionType.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'sapAiCoreApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Model Name',
				name: 'modelName',
				type: 'options',
				default: 'gpt-4o-mini',
				description: 'The model to use for chat completions',
				required: true,
				options: [
					{
						name: 'GPT-4o Mini',
						value: 'gpt-4o-mini',
					},
					{
						name: 'GPT-4o',
						value: 'gpt-4o',
					},
					{
						name: 'GPT-4',
						value: 'gpt-4',
					},
					{
						name: 'GPT-3.5 Turbo',
						value: 'gpt-3.5-turbo',
					},
				],
			},
			{
				displayName: 'Resource Group',
				name: 'resourceGroup',
				type: 'string',
				default: 'default',
				description: 'SAP AI Core resource group (optional, uses default if not specified)',
				required: false,
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to add',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'API Version',
						name: 'apiVersion',
						type: 'string',
						default: '2024-02-01',
						description: 'API version to use for SAP AI Core',
					},
					{
						displayName: 'Frequency Penalty',
						name: 'frequencyPenalty',
						type: 'number',
						typeOptions: {
							minValue: -2,
							maxValue: 2,
							numberPrecision: 1,
						},
						default: 0,
						description: 'Positive values penalize tokens based on their frequency',
					},
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokens',
						type: 'number',
						default: -1,
						description: 'Maximum number of tokens to generate (-1 for no limit)',
					},
					{
						displayName: 'Max Retries',
						name: 'maxRetries',
						type: 'number',
						default: 2,
						description: 'Maximum number of retries for failed requests',
					},
					{
						displayName: 'Presence Penalty',
						name: 'presencePenalty',
						type: 'number',
						typeOptions: {
							minValue: -2,
							maxValue: 2,
							numberPrecision: 1,
						},
						default: 0,
						description: 'Positive values penalize tokens based on whether they appear',
					},
					{
						displayName: 'Response Format',
						name: 'responseFormat',
						type: 'options',
						default: 'text',
						options: [
							{
								name: 'Text',
								value: 'text',
								description: 'Regular text response',
							},
							{
								name: 'JSON',
								value: 'json_object',
								description: 'JSON formatted response',
							},
						],
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						type: 'number',
						typeOptions: {
							minValue: 0,
							maxValue: 2,
							numberPrecision: 1,
						},
						default: 0.7,
						description: 'Controls randomness in output (0-2)',
					},
					{
						displayName: 'Streaming',
						name: 'streaming',
						type: 'boolean',
						default: false,
						description: 'Whether to stream the response',
					},
					{
						displayName: 'Timeout',
						name: 'timeout',
						type: 'number',
						default: 60000,
						description: 'Request timeout in milliseconds',
					},
					{
						displayName: 'Top P',
						name: 'topP',
						type: 'number',
						typeOptions: {
							minValue: 0,
							maxValue: 1,
							numberPrecision: 1,
						},
						default: 1,
						description: 'Controls diversity via nucleus sampling',
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<{ response: any }> {
		try {
			// Import official SAP AI SDK LangChain client
			const { AzureOpenAiChatClient } = await import('@sap-ai-sdk/langchain');
			
			// Get parameters
			const credentials = await this.getCredentials('sapAiCoreApi') as any;
			const modelName = this.getNodeParameter('modelName', itemIndex) as string;
			const resourceGroup = this.getNodeParameter('resourceGroup', itemIndex, 'default') as string;
			const options = this.getNodeParameter('options', itemIndex, {}) as any;

			// Set up environment for SAP AI SDK authentication
			// The SDK expects the service key in environment or as configuration
			process.env.AICORE_SERVICE_KEY = JSON.stringify({
				clientid: credentials.clientId,
				clientsecret: credentials.clientSecret,
				url: credentials.oauthUrl,
				serviceurls: {
					AI_API_URL: credentials.baseUrl
				},
				ai_api_url: credentials.baseUrl
			});

			// Validate required credentials
			if (!credentials.clientId || !credentials.clientSecret || !credentials.oauthUrl || !credentials.baseUrl) {
				throw new NodeOperationError(
					this.getNode(),
					'Incomplete SAP AI Core credentials. Please ensure all fields are filled:\n' +
					'- Client ID\n- Client Secret\n- OAuth URL\n- Base URL',
					{ itemIndex }
				);
			}

			// Create SAP AI SDK client following official pattern with n8n integration
			const client = new AzureOpenAiChatClient({
				modelName: modelName, // Use actual model name, not deployment ID
				max_tokens: options.maxTokens > 0 ? options.maxTokens : undefined,
				temperature: options.temperature ?? 0.7,
				top_p: options.topP ?? 1,
				frequency_penalty: options.frequencyPenalty ?? 0,
				presence_penalty: options.presencePenalty ?? 0,
				callbacks: [new N8nLlmTracing(this)],
			});

			// Add response format if specified (using proper SAP AI SDK method)
			if (options.responseFormat && options.responseFormat !== 'text') {
				// Set response format using the correct SAP AI SDK approach
				try {
					(client as any).modelKwargs = { 
						response_format: { type: options.responseFormat } 
					};
				} catch (formatError) {
					// Response format might not be supported - continue without it
					console.warn('Response format not supported by SAP AI SDK:', options.responseFormat);
				}
			}

			// Validate client was created successfully
			if (!client) {
				throw new NodeOperationError(
					this.getNode(),
					'Failed to create SAP AI Core client. Please check your configuration.',
					{ itemIndex }
				);
			}

			return {
				response: client,
			};

		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			
			if (errorMessage.includes('Cannot find module') && errorMessage.includes('@sap-ai-sdk/langchain')) {
				throw new NodeOperationError(
					this.getNode(),
					'SAP AI SDK LangChain package is required. Please install it with:\n' +
					'npm install @sap-ai-sdk/langchain',
					{ itemIndex }
				);
			}
			
			// Enhanced error handling for SAP AI Core specific issues
			if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
				throw new NodeOperationError(
					this.getNode(),
					'SAP AI Core authentication failed. Please check your credentials:\n' +
					'- Client ID\n- Client Secret\n- Auth URL\n- API URL',
					{ itemIndex }
				);
			}
			
			if (errorMessage.includes('deployment') || errorMessage.includes('404')) {
				throw new NodeOperationError(
					this.getNode(),
					'SAP AI Core deployment not found. Please check:\n' +
					'- Model name is correct\n- Resource group has access\n- Deployment is active',
					{ itemIndex }
				);
			}
			
			throw new NodeOperationError(
				this.getNode(),
				`Failed to initialize SAP AI Core Chat Model: ${errorMessage}`,
				{ itemIndex }
			);
		}
	}
}

export { SapAiCoreChatModel };