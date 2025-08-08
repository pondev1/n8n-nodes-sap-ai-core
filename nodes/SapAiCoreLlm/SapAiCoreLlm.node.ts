import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
	INodeParameters,
} from 'n8n-workflow';

// LangChain imports removed - using SAP AI SDK OrchestrationClient instead

// Import utilities
import { getConnectedTools, logAiEvent } from '../../utils/helpers';
import { throwIfInvalidToolSchema } from '../../utils/schemaParsing';

export class SapAiCoreLlm implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SAP AI Core LLM',
		name: 'sapAiCoreLlm',
		icon: 'file:sapaicore.svg',
		group: ['transform'],
		version: 1,
		description: 'AI Agent powered by SAP AI Core with LangChain integration',
		defaults: {
			name: 'SAP AI Core LLM',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Agents', 'Language Models'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://help.sap.com/docs/sap-ai-core',
					},
				],
			},
		},
		inputs: [
			NodeConnectionType.Main,
			{
				displayName: 'Tools',
				type: NodeConnectionType.AiTool,
				required: false,
				maxConnections: undefined,
			},
		],
		outputs: [NodeConnectionType.Main],
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
				default: 'gpt-4o-mini',
				required: true,
				description: 'The model to use for chat completions',
			},
			{
				displayName: 'Resource Group',
				name: 'resourceGroup',
				type: 'string',
				default: 'default',
				required: true,
				description: 'SAP AI Core resource group',
			},
			{
				displayName: 'User Message',
				name: 'userMessage',
				type: 'string',
				required: true,
				default: '={{$json.chatInput || $json.message || "Hello, how can you help me?"}}',
				typeOptions: {
					rows: 3,
				},
				description: 'The message from the user',
			},
			{
				displayName: 'System Message',
				name: 'systemMessage',
				type: 'string',
				default: 'You are a helpful AI assistant.',
				typeOptions: {
					rows: 2,
				},
				description: 'System message that defines the AI behavior',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Temperature',
						name: 'temperature',
						type: 'number',
						default: 0.7,
						typeOptions: {
							maxValue: 2,
							minValue: 0,
							numberPrecision: 2,
						},
						description: 'Controls randomness in output (0-2)',
					},
					{
						displayName: 'Max Tokens',
						name: 'maxTokens',
						type: 'number',
						default: 1000,
						typeOptions: {
							minValue: 1,
							maxValue: 8000,
						},
						description: 'Maximum number of tokens to generate',
					},
					{
						displayName: 'Top P',
						name: 'topP',
						type: 'number',
						default: 1,
						typeOptions: {
							maxValue: 1,
							minValue: 0,
							numberPrecision: 2,
						},
						description: 'Controls diversity via nucleus sampling',
					},
					{
						displayName: 'Max Iterations',
						name: 'maxIterations',
						type: 'number',
						default: 10,
						typeOptions: {
							minValue: 1,
							maxValue: 50,
						},
						description: 'Maximum number of tool calling iterations',
					},
					{
						displayName: 'Verbose Logging',
						name: 'verboseLogging',
						type: 'boolean',
						default: false,
						description: 'Enable detailed logging for debugging',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				// Get parameters
				const modelName = this.getNodeParameter('modelName', i) as string;
				const resourceGroup = this.getNodeParameter('resourceGroup', i) as string;
				const userMessage = this.getNodeParameter('userMessage', i) as string;
				const systemMessage = this.getNodeParameter('systemMessage', i) as string;
				const options = this.getNodeParameter('options', i, {}) as INodeParameters;

				// Validate required fields
				if (!userMessage?.trim()) {
					throw new NodeOperationError(this.getNode(), 'User message is required');
				}

				// Log execution start
				if (options.verboseLogging) {
					this.logger?.debug('Starting SAP AI Core LLM execution', {
						modelName,
						resourceGroup,
						messageLength: userMessage.length,
					});
				}

				// Get credentials for SAP AI Core
				const credentials = await this.getCredentials('sapAiCoreApi') as any;
				if (!credentials.clientId || !credentials.clientSecret || !credentials.oauthUrl || !credentials.baseUrl) {
					throw new NodeOperationError(
						this.getNode(),
						'Incomplete SAP AI Core credentials. Please ensure all fields are filled.'
					);
				}

				// Set up environment for SAP AI SDK
				process.env.AICORE_SERVICE_KEY = JSON.stringify({
					clientid: credentials.clientId,
					clientsecret: credentials.clientSecret,
					url: credentials.oauthUrl,
					serviceurls: {
						AI_API_URL: credentials.baseUrl
					},
					ai_api_url: credentials.baseUrl
				});

				// Import SAP AI SDK LangChain client for agent support
				const { OrchestrationClient } = await import('@sap-ai-sdk/langchain');

				// Create SAP AI Core LangChain client with tool support
				const llm = new OrchestrationClient({
					llm: {
						model_name: modelName,
						model_params: {
							max_tokens: Number(options.maxTokens) || 1000,
							temperature: Number(options.temperature) || 0.7,
							top_p: Number(options.topP) || 1,
						}
					}
				});

				// Get connected tools
				let tools: any[] = [];
				let hasTools = false;
				let toolErrors: string[] = [];
				
				try {
					const rawTools = await getConnectedTools(this, true, true);
					tools = rawTools || [];
					hasTools = tools.length > 0;
					
					if (options.verboseLogging && hasTools) {
						this.logger?.debug(`Found ${tools.length} tools`, {
							toolNames: tools.map(t => t?.name || 'unnamed'),
						});
					}

					// Validate tools and filter out any that are null or invalid
					tools = tools.filter(tool => {
						if (!tool) {
							toolErrors.push('Found null/undefined tool');
							return false;
						}
						if (!tool.name) {
							toolErrors.push('Found tool without name');
							return false;
						}
						if (!tool.func && !tool.call && !tool._call) {
							toolErrors.push(`Tool ${tool.name} has no callable function`);
							return false;
						}
						return true;
					});

					hasTools = tools.length > 0;
					
				} catch (toolError) {
					const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
					toolErrors.push(`Tool loading error: ${errorMsg}`);
					
					if (options.verboseLogging) {
						this.logger?.warn('Tool loading failed, continuing without tools', { error: errorMsg });
					}
					tools = [];
					hasTools = false;
				}

				let result: any;

				if (hasTools) {
					// Use SAP AI Core OrchestrationClient with tools - proper SAP AI SDK approach
					try {
						// Bind tools to the model using SAP AI SDK method
						const modelWithTools = llm.bindTools(tools);

						// Create messages for the conversation
						const messages = [
							{ role: 'system', content: systemMessage },
							{ role: 'user', content: userMessage }
						];

						// Invoke the model with tools
						const response = await modelWithTools.invoke(messages);

						// Check if the model wants to call tools
						if (response.tool_calls && response.tool_calls.length > 0) {
							// Execute tool calls
							const toolResults = [];
							
							for (const toolCall of response.tool_calls) {
								const tool = tools.find(t => t.name === toolCall.name);
								if (tool) {
									try {
										const toolResult = await tool.invoke(toolCall.args);
										toolResults.push({
											tool_call_id: toolCall.id,
											tool_name: toolCall.name,
											result: toolResult
										});
									} catch (toolError) {
										toolResults.push({
											tool_call_id: toolCall.id,
											tool_name: toolCall.name,
											error: toolError instanceof Error ? toolError.message : String(toolError)
										});
									}
								}
							}

							// Send tool results back to the model for final response
							const finalMessages = [
								...messages,
								{ role: 'assistant', content: response.content, tool_calls: response.tool_calls },
								...toolResults.map(tr => ({
									role: 'tool',
									content: tr.error ? `Error: ${tr.error}` : JSON.stringify(tr.result),
									tool_call_id: tr.tool_call_id
								}))
							];

							const finalResponse = await modelWithTools.invoke(finalMessages);

							result = {
								output: finalResponse.content,
								intermediateSteps: toolResults,
								toolsUsed: tools.length,
								executionType: 'sap_ai_core_with_tools',
								toolCalls: response.tool_calls,
								toolResults: toolResults
							};
						} else {
							// No tool calls needed
							result = {
								output: response.content,
								intermediateSteps: [],
								toolsUsed: tools.length,
								executionType: 'sap_ai_core_direct_response',
							};
						}

					} catch (agentError) {
						// Enhanced error logging
						const errorMsg = agentError instanceof Error ? agentError.message : String(agentError);
						toolErrors.push(`SAP AI Core tool execution error: ${errorMsg}`);
						
						if (options.verboseLogging) {
							this.logger?.warn('SAP AI Core tool execution failed, falling back to direct LLM', { error: errorMsg });
						}

						// Fallback to direct LLM call only if tool execution fails
						const messages = [
							{ role: 'system', content: systemMessage },
							{ role: 'user', content: userMessage }
						];

						const response = await llm.invoke(messages);

						result = {
							output: response.content,
							intermediateSteps: [],
							toolsUsed: 0,
							executionType: 'direct_llm_fallback',
							error: `Tool execution failed: ${errorMsg}`,
						};
					}

				} else {
					// Direct LLM call without tools
					const messages = [
						{ role: 'system', content: systemMessage },
						{ role: 'user', content: userMessage }
					];

					const response = await llm.invoke(messages);

					result = {
						output: response.content,
						intermediateSteps: [],
						toolsUsed: 0,
						executionType: 'sap_ai_core_direct',
					};
				}

				// Log success
				if (options.verboseLogging) {
					this.logger?.debug('SAP AI Core LLM execution completed', {
						outputLength: result.output?.length || 0,
						toolsUsed: result.toolsUsed,
						executionType: result.executionType,
					});
				}

				// Prepare return data
				const outputData: any = {
					output: result.output,
					model: modelName,
					resourceGroup,
					userMessage,
					systemMessage,
					toolsUsed: result.toolsUsed,
					executionType: result.executionType,
					intermediateSteps: result.intermediateSteps,
					// Add usage info if available
					...(result.usage && { usage: result.usage }),
				};

				// Add tool errors if any occurred
				if (toolErrors.length > 0) {
					outputData.toolErrors = toolErrors;
					outputData.toolWarnings = `${toolErrors.length} tool-related issues occurred`;
				}

				// Add additional debug info if verbose logging is enabled
				if (options.verboseLogging) {
					outputData.debug = {
						toolsFound: tools.length,
						toolNames: tools.map(t => t.name),
						hasValidTools: hasTools,
					};
				}

				returnData.push({ json: outputData });

			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				
				// Enhanced error handling for SAP AI Core
				if (errorMessage.includes('Cannot find module') && errorMessage.includes('@sap-ai-sdk/langchain')) {
					throw new NodeOperationError(
						this.getNode(),
						'SAP AI SDK LangChain package is required. Please install it with: npm install @sap-ai-sdk/langchain'
					);
				}
				
				if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
					throw new NodeOperationError(
						this.getNode(),
						'SAP AI Core authentication failed. Please check your credentials.'
					);
				}

				// Handle schema validation errors
				try {
					throwIfInvalidToolSchema(this, error);
				} catch (schemaError) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: schemaError instanceof Error ? schemaError.message : String(schemaError),
								type: 'schema_error',
							},
							pairedItem: { item: i },
						});
						continue;
					}
					throw schemaError;
				}

				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: errorMessage,
							type: 'execution_error',
							userMessage: this.getNodeParameter('userMessage', i, ''),
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}