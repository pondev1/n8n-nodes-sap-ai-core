// SapAiCoreEmbeddings.node.ts - SAP AI Core embeddings implementation
import {
	ISupplyDataFunctions,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	NodeOperationError,
} from 'n8n-workflow';

class SapAiCoreEmbeddings implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SAP AI Core Embeddings',
		name: 'sapAiCoreEmbeddings',
		icon: 'file:sapaicore.svg',
		group: ['transform'],
		version: 1,
		description: 'Use SAP AI Core for text embeddings with vector stores',
		defaults: {
			name: 'SAP AI Core Embeddings',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Embeddings'],
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
		outputs: [NodeConnectionType.AiEmbedding],
		outputNames: ['Embeddings'],
		credentials: [
			{
				name: 'sapAiCoreApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Use this node to connect SAP AI Core embeddings to vector stores and other AI components.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				default: 'text-embedding-ada-002',
				description: 'The embedding model to use',
				required: true,
				options: [
					{
						name: 'Text Embedding Ada 002',
						value: 'text-embedding-ada-002',
						description: 'OpenAI ada-002 embedding model (1536 dimensions)',
					},
					{
						name: 'Text Embedding 3 Small',
						value: 'text-embedding-3-small',
						description: 'OpenAI text-embedding-3-small (configurable dimensions)',
					},
					{
						name: 'Text Embedding 3 Large',
						value: 'text-embedding-3-large',
						description: 'OpenAI text-embedding-3-large (configurable dimensions)',
					},
				],
			},
			{
				displayName: 'Deployment ID',
				name: 'deploymentId',
				type: 'string',
				default: '',
				description: 'SAP AI Core deployment ID for the embedding model',
				required: true,
				placeholder: 'e.g., dabcd1234567890',
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
						displayName: 'Batch Size',
						name: 'batchSize',
						type: 'number',
						default: 512,
						typeOptions: {
							maxValue: 2048,
							minValue: 1,
						},
						description: 'Maximum number of documents to send in each request',
					},
					{
						displayName: 'Dimensions',
						name: 'dimensions',
						type: 'options',
						default: undefined,
						description: 'Number of dimensions for the embeddings (only supported in text-embedding-3 models)',
						options: [
							{
								name: '256',
								value: 256,
							},
							{
								name: '512',
								value: 512,
							},
							{
								name: '1024',
								value: 1024,
							},
							{
								name: '1536',
								value: 1536,
							},
							{
								name: '3072',
								value: 3072,
							},
						],
						displayOptions: {
							show: {
								'/model': ['text-embedding-3-small', 'text-embedding-3-large'],
							},
						},
					},
					{
						displayName: 'Strip New Lines',
						name: 'stripNewLines',
						type: 'boolean',
						default: true,
						description: 'Whether to strip new lines from the input text',
					},
					{
						displayName: 'Timeout',
						name: 'timeout',
						type: 'number',
						default: 60000,
						description: 'Request timeout in milliseconds',
					},
					{
						displayName: 'Max Retries',
						name: 'maxRetries',
						type: 'number',
						default: 2,
						description: 'Maximum number of retries for failed requests',
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<{ response: any }> {
		try {
			// Import SAP AI SDK and n8n utilities
			const { AzureOpenAiEmbeddingClient } = await import('@sap-ai-sdk/langchain');
			
			// Get parameters
			const credentials = await this.getCredentials('sapAiCoreApi') as any;
			const model = this.getNodeParameter('model', itemIndex) as string;
			const deploymentId = this.getNodeParameter('deploymentId', itemIndex) as string;
			const resourceGroup = this.getNodeParameter('resourceGroup', itemIndex, 'default') as string;
			const options = this.getNodeParameter('options', itemIndex, {}) as any;

			// Set up environment for SAP AI SDK authentication
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

			// Validate deployment ID
			if (!deploymentId || deploymentId.trim() === '') {
				throw new NodeOperationError(
					this.getNode(),
					'Deployment ID is required. Please provide your SAP AI Core embedding deployment ID.',
					{ itemIndex }
				);
			}

			// Prepare embedding configuration (keeping original working config)
			const embeddingConfig: any = {
				modelName: model,
				deploymentId: deploymentId,
				resourceGroup: resourceGroup,
			};

			// Add dimensions if specified (for text-embedding-3 models)
			if (options.dimensions && (model === 'text-embedding-3-small' || model === 'text-embedding-3-large')) {
				embeddingConfig.dimensions = options.dimensions;
			}

			// Add other options
			if (options.batchSize) {
				embeddingConfig.batchSize = options.batchSize;
			}

			if (options.stripNewLines !== undefined) {
				embeddingConfig.stripNewLines = options.stripNewLines;
			}

			// Create SAP AI SDK embeddings client
			let sapEmbeddings;
			try {
				sapEmbeddings = new AzureOpenAiEmbeddingClient(embeddingConfig);
				
				// Test the client initialization
				if (!sapEmbeddings) {
					throw new Error('Client creation returned null/undefined');
				}
				
				if (typeof sapEmbeddings.embedQuery !== 'function') {
					throw new Error(`embedQuery method not available. Client type: ${typeof sapEmbeddings}, methods: ${Object.keys(sapEmbeddings || {}).join(', ')}`);
				}
				
				if (typeof sapEmbeddings.embedDocuments !== 'function') {
					throw new Error(`embedDocuments method not available. Client methods: ${Object.keys(sapEmbeddings || {}).join(', ')}`);
				}
				
			} catch (clientError) {
				throw new NodeOperationError(
					this.getNode(),
					`Failed to create SAP AI Core embeddings client: ${clientError instanceof Error ? clientError.message : String(clientError)}. Please check your SAP AI Core credentials and configuration.`,
					{ itemIndex }
				);
			}

			// Create a wrapper that implements the full LangChain Embeddings interface
			const { Embeddings } = await import('@langchain/core/embeddings');
			
			class SapEmbeddingsWrapper extends Embeddings {
				constructor(private sapClient: any) {
					super({});
					
					if (!this.sapClient) {
						throw new Error('SAP client is null or undefined');
					}
				}

				async embedDocuments(texts: string[]): Promise<number[][]> {
					if (!this.sapClient) {
						throw new Error('SAP client is not initialized');
					}
					
					try {
						const result = await this.sapClient.embedDocuments(texts);
						return result;
					} catch (error) {
						throw new Error(`SAP embedDocuments failed: ${error instanceof Error ? error.message : String(error)}`);
					}
				}

				async embedQuery(text: string): Promise<number[]> {
					if (!this.sapClient) {
						throw new Error('SAP client is not initialized');
					}
					
					try {
						const result = await this.sapClient.embedQuery(text);
						return result;
					} catch (error) {
						throw new Error(`SAP embedQuery failed: ${error instanceof Error ? error.message : String(error)}`);
					}
				}
			}

			const embeddings = new SapEmbeddingsWrapper(sapEmbeddings);

			// Import logWrapper for execution tracking (using local copy)
			try {
				const { logWrapper } = await import('../../utils/logWrapper');
				const wrappedEmbeddings = logWrapper(embeddings, this);

				return {
					response: wrappedEmbeddings,
				};
			} catch (logWrapperError) {
				// Fallback to unwrapped embeddings if logWrapper fails
				return {
					response: embeddings,
				};
			}

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
					'- Client ID\n- Client Secret\n- OAuth URL\n- Base URL',
					{ itemIndex }
				);
			}
			
			if (errorMessage.includes('deployment') || errorMessage.includes('404')) {
				throw new NodeOperationError(
					this.getNode(),
					'SAP AI Core deployment not found. Please check:\n' +
					'- Deployment ID is correct\n- Model is deployed and active\n- Resource group has access',
					{ itemIndex }
				);
			}
			
			throw new NodeOperationError(
				this.getNode(),
				`Failed to initialize SAP AI Core Embeddings: ${errorMessage}`,
				{ itemIndex }
			);
		}
	}
}

export { SapAiCoreEmbeddings };