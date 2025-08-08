/**
 * UI field descriptions and configurations for SAP AI Core LLM node
 * Based on OpenAI Assistant patterns but adapted for SAP AI Core
 */

export const schemaTypeField = {
	displayName: 'Schema Type',
	name: 'schemaType',
	type: 'options',
	noDataExpression: true,
	options: [
		{
			name: 'Generate From JSON Example',
			value: 'fromJson',
			description: 'Generate a schema from an example JSON object'
		},
		{
			name: 'Define using JSON Schema',
			value: 'manual',
			description: 'Define the JSON schema manually'
		}
	],
	default: 'fromJson',
	description: 'How to specify the schema for the function'
} as const;

export const buildJsonSchemaExampleField = (props?: { showExtraProps?: any }) => ({
	displayName: 'JSON Example',
	name: 'jsonSchemaExample',
	type: 'json',
	default: `{
	"query": "example query",
	"parameters": {
		"limit": 10,
		"filter": "active"
	}
}`,
	noDataExpression: true,
	typeOptions: {
		rows: 10
	},
	displayOptions: {
		show: {
			...props?.showExtraProps,
			schemaType: ['fromJson']
		}
	},
	description: 'Example JSON object to use to generate the schema for SAP AI Core'
});

export const buildJsonSchemaExampleNotice = (props?: { showExtraProps?: any }) => ({
	displayName: 'All properties will be required. To make them optional, use the "JSON Schema" schema type instead',
	name: 'notice',
	type: 'notice',
	default: '',
	displayOptions: {
		show: {
			...props?.showExtraProps,
			schemaType: ['fromJson']
		}
	}
});

export const jsonSchemaExampleField = buildJsonSchemaExampleField();

export const buildInputSchemaField = (props?: { showExtraProps?: any }) => ({
	displayName: 'Input Schema',
	name: 'inputSchema',
	type: 'json',
	default: `{
	"type": "object",
	"properties": {
		"query": {
			"type": "string",
			"description": "The query to process"
		},
		"parameters": {
			"type": "object",
			"properties": {
				"limit": {
					"type": "number",
					"description": "Maximum number of results"
				}
			}
		}
	},
	"required": ["query"]
}`,
	noDataExpression: false,
	typeOptions: {
		rows: 15
	},
	displayOptions: {
		show: {
			...props?.showExtraProps,
			schemaType: ['manual']
		}
	},
	description: 'Schema to use for the function',
	hint: 'Use <a target="_blank" href="https://json-schema.org/">JSON Schema</a> format (<a target="_blank" href="https://json-schema.org/learn/miscellaneous-examples.html">examples</a>). $refs syntax is currently not supported.'
});

export const inputSchemaField = buildInputSchemaField();

export const promptTypeOptions = {
	displayName: 'Source for Prompt (User Message)',
	name: 'promptType',
	type: 'options',
	options: [
		{
			name: 'Connected Chat Trigger Node',
			value: 'auto',
			description: 'Looks for an input field called "chatInput" that is coming from a directly connected Chat Trigger'
		},
		{
			name: 'Define below',
			value: 'define',
			description: 'Use an expression to reference data in previous nodes or enter static text'
		}
	],
	default: 'auto'
} as const;

export const textInput = {
	displayName: 'Prompt (User Message)',
	name: 'text',
	type: 'string',
	required: true,
	default: '',
	placeholder: 'e.g. Hello, how can you help me analyze this data?',
	typeOptions: {
		rows: 3
	}
} as const;

export const textFromPreviousNode = {
	displayName: 'Prompt (User Message)',
	name: 'text',
	type: 'string',
	required: true,
	default: '={{ $json.chatInput }}',
	typeOptions: {
		rows: 3
	},
	displayOptions: { 
		show: { 
			promptType: ['define'] 
		} 
	}
} as const;

export const toolDescription = {
	displayName: 'Description',
	name: 'toolDescription',
	type: 'string',
	default: 'SAP AI Core Agent that can call other tools to perform various tasks',
	required: true,
	typeOptions: { rows: 2 },
	description: 'Explain to the LLM what this tool does. A good, specific description allows SAP AI Core to produce expected results much more often'
} as const;

export const sapAiCoreModelField = {
	displayName: 'SAP AI Core Model',
	name: 'model',
	type: 'options',
	description: 'The SAP AI Core model to use for processing. Different models have different capabilities and performance characteristics.',
	required: true,
	typeOptions: {
		loadOptions: {
			routing: {
				request: {
					method: 'GET',
					url: '/v2/lm/deployments'
				},
				output: {
					postReceive: [
						{
							type: 'rootProperty',
							properties: {
								property: 'resources'
							}
						},
						{
							type: 'filter',
							properties: {
								pass: '={{ $responseItem.status === "RUNNING" }}'
							}
						},
						{
							type: 'setKeyValue',
							properties: {
								name: '={{$responseItem.id}} ({{$responseItem.scenarioId}})',
								value: '={{$responseItem.id}}',
								description: '={{$responseItem.details?.scaling?.backend_details?.model?.name || $responseItem.scenarioId}}'
							}
						},
						{
							type: 'sort',
							properties: {
								key: 'name'
							}
						}
					]
				}
			}
		}
	},
	routing: {
		send: {
			type: 'body',
			property: 'deploymentId'
		}
	},
	default: ''
} as const;

export const sapAiCoreOptionsField = {
	displayName: 'SAP AI Core Options',
	name: 'sapAiCoreOptions',
	type: 'collection',
	placeholder: 'Add SAP AI Core Option',
	default: {},
	options: [
		{
			displayName: 'Resource Group',
			name: 'resourceGroup',
			type: 'string',
			default: 'default',
			description: 'SAP AI Core resource group to use'
		},
		{
			displayName: 'Temperature',
			name: 'temperature',
			type: 'number',
			default: 0.7,
			typeOptions: { 
				maxValue: 2, 
				minValue: 0, 
				numberPrecision: 2 
			},
			description: 'Controls randomness in the output. Lower values make output more deterministic.'
		},
		{
			displayName: 'Max Tokens',
			name: 'maxTokens',
			type: 'number',
			default: 1000,
			typeOptions: {
				minValue: 1,
				maxValue: 8000
			},
			description: 'Maximum number of tokens to generate'
		},
		{
			displayName: 'Top P',
			name: 'topP',
			type: 'number',
			default: 1,
			typeOptions: { 
				maxValue: 1, 
				minValue: 0, 
				numberPrecision: 2 
			},
			description: 'Controls diversity via nucleus sampling'
		},
		{
			displayName: 'Frequency Penalty',
			name: 'frequencyPenalty',
			type: 'number',
			default: 0,
			typeOptions: { 
				maxValue: 2, 
				minValue: -2, 
				numberPrecision: 2 
			},
			description: 'Penalize new tokens based on their frequency in the text so far'
		},
		{
			displayName: 'Presence Penalty',
			name: 'presencePenalty',
			type: 'number',
			default: 0,
			typeOptions: { 
				maxValue: 2, 
				minValue: -2, 
				numberPrecision: 2 
			},
			description: 'Penalize new tokens based on whether they appear in the text so far'
		}
	]
} as const;

export const agentOptionsField = {
	displayName: 'Agent Options',
	name: 'agentOptions',
	type: 'collection',
	placeholder: 'Add Agent Option',
	default: {},
	options: [
		{
			displayName: 'Max Iterations',
			name: 'maxIterations',
			type: 'number',
			default: 10,
			typeOptions: {
				minValue: 1,
				maxValue: 50
			},
			description: 'Maximum number of iterations the agent will run'
		},
		{
			displayName: 'Return Intermediate Steps',
			name: 'returnIntermediateSteps',
			type: 'boolean',
			default: false,
			description: 'Whether to return intermediate steps taken by the agent'
		},
		{
			displayName: 'Early Stopping Method',
			name: 'earlyStoppingMethod',
			type: 'options',
			options: [
				{
					name: 'Force',
					value: 'force',
					description: 'Force stop when max iterations reached'
				},
				{
					name: 'Generate',
					value: 'generate',
					description: 'Generate final answer when max iterations reached'
				}
			],
			default: 'force',
			description: 'Method to use when stopping early'
		},
		{
			displayName: 'Handle Parsing Errors',
			name: 'handleParsingErrors',
			type: 'boolean',
			default: true,
			description: 'Whether to handle parsing errors gracefully'
		}
	]
} as const;

export const memoryOptionsField = {
	displayName: 'Memory Configuration',
	name: 'memoryConfig',
	type: 'collection',
	placeholder: 'Add Memory Option',
	default: {},
	options: [
		{
			displayName: 'Memory Type',
			name: 'memoryType',
			type: 'options',
			options: [
				{
					name: 'Buffer Memory',
					value: 'buffer',
					description: 'Simple buffer memory that stores conversation history'
				},
				{
					name: 'Summary Memory',
					value: 'summary',
					description: 'Summarizes conversation history to save tokens'
				},
				{
					name: 'Token Buffer Memory',
					value: 'tokenBuffer',
					description: 'Buffer memory with token limit'
				}
			],
			default: 'buffer',
			description: 'Type of memory to use for conversation history'
		},
		{
			displayName: 'Memory Key',
			name: 'memoryKey',
			type: 'string',
			default: 'chat_history',
			description: 'Key to use for storing memory in the context'
		},
		{
			displayName: 'Input Key',
			name: 'inputKey',
			type: 'string',
			default: 'input',
			description: 'Key for input in the memory'
		},
		{
			displayName: 'Output Key',
			name: 'outputKey',
			type: 'string',
			default: 'output',
			description: 'Key for output in the memory'
		},
		{
			displayName: 'Return Messages',
			name: 'returnMessages',
			type: 'boolean',
			default: true,
			description: 'Whether to return messages as objects instead of strings'
		}
	]
} as const;

export const connectionNoticeField = {
	displayName: 'This node requires a connection to an SAP AI Core Language Model. Connect a Language Model node to get started.',
	name: 'connectionNotice',
	type: 'notice',
	default: '',
	typeOptions: {
		theme: 'info'
	}
} as const;

export const toolConnectionNoticeField = {
	displayName: 'Connect Tool nodes to give this agent additional capabilities. Tools allow the agent to perform specific actions like making API calls, querying databases, or processing data.',
	name: 'toolNotice',
	type: 'notice',
	default: '',
	typeOptions: {
		theme: 'info'
	}
} as const;

export const sapAiCoreCredentialsNotice = {
	displayName: 'You need SAP AI Core credentials to use this node. Make sure your credentials have access to the AI Core service and the specific deployment you want to use.',
	name: 'credentialsNotice',
	type: 'notice',
	default: '',
	typeOptions: {
		theme: 'warning'
	}
} as const;