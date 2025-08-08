import { Toolkit } from 'langchain/agents';
import { 
	NodeConnectionType, 
	NodeOperationError, 
	jsonStringify,
	deepCopy,
	IDataObject
} from 'n8n-workflow';
import type { IExecuteFunctions } from 'n8n-workflow';
import { N8nTool } from './N8nTool';

/**
 * Check if an object has specific methods
 */
function hasMethods(obj: any, ...methodNames: string[]): boolean {
	return methodNames.every(
		(methodName) => 
			typeof obj === "object" && 
			obj !== null && 
			methodName in obj && 
			typeof obj[methodName] === "function"
	);
}

/**
 * Get metadata filters values from node parameters
 */
export function getMetadataFiltersValues(ctx: IExecuteFunctions, itemIndex: number): any {
	const options = ctx.getNodeParameter("options", itemIndex, {}) as IDataObject;
	
	if (options.metadata && typeof options.metadata === 'object') {
		const metadata = options.metadata as IDataObject;
		const metadataValues = metadata.metadataValues as IDataObject[];
		if (metadataValues && Array.isArray(metadataValues) && metadataValues.length > 0) {
			return metadataValues.reduce((acc: any, { name, value }: any) => ({ ...acc, [name]: value }), {});
		}
	}
	
	if (options.searchFilterJson) {
		return ctx.getNodeParameter("options.searchFilterJson", itemIndex, "", {
			ensureType: "object"
		});
	}
	
	return undefined;
}

/**
 * Check if object is a base chat memory instance
 */
export function isBaseChatMemory(obj: any): boolean {
	return hasMethods(obj, "loadMemoryVariables", "saveContext");
}

/**
 * Check if object is a base chat message history instance
 */
export function isBaseChatMessageHistory(obj: any): boolean {
	return hasMethods(obj, "getMessages", "addMessage");
}

/**
 * Check if model is a chat instance
 */
export function isChatInstance(model: any): boolean {
	const namespace = model?.lc_namespace ?? [];
	return namespace.includes("chat_models");
}

/**
 * Check if model is a tools instance
 */
export function isToolsInstance(model: any): boolean {
	const namespace = model?.lc_namespace ?? [];
	return namespace.includes("tools");
}

/**
 * Get prompt input based on type configuration
 */
export function getPromptInputByType(options: {
	ctx: IExecuteFunctions;
	i: number;
	promptTypeKey: string;
	inputKey: string;
}): any {
	const { ctx, i, promptTypeKey, inputKey } = options;
	const promptType = ctx.getNodeParameter(promptTypeKey, i, "define");
	
	let input;
	if (promptType === "auto") {
		input = ctx.evaluateExpression('{{ $json["chatInput"] }}', i);
	} else {
		input = ctx.getNodeParameter(inputKey, i);
	}
	
	if (input === undefined) {
		throw new NodeOperationError(ctx.getNode(), "No prompt specified", {
			description: "Expected to find the prompt in an input field called 'chatInput' (this is what the chat trigger node outputs). To use something else, change the 'Prompt' parameter"
		});
	}
	
	return input;
}

/**
 * Get session ID from various sources
 */
export function getSessionId(
	ctx: IExecuteFunctions, 
	itemIndex: number, 
	selectorKey: string = "sessionIdType", 
	autoSelect: string = "fromInput", 
	customKey: string = "sessionKey"
): string {
	let sessionId = "";
	const selectorType = ctx.getNodeParameter(selectorKey, itemIndex);
	
	if (selectorType === autoSelect) {
		if ("getBodyData" in ctx) {
			const bodyData = (ctx as any).getBodyData() ?? {};
			sessionId = String(bodyData.sessionId || "");
		} else {
			const evaluatedValue = ctx.evaluateExpression("{{ $json.sessionId }}", itemIndex);
			sessionId = String(evaluatedValue || "");
		}
		
		if (sessionId === "" || sessionId === undefined) {
			throw new NodeOperationError(ctx.getNode(), "No session ID found", {
				description: "Expected to find the session ID in an input field called 'sessionId' (this is what the chat trigger node outputs). To use something else, change the 'Session ID' parameter",
				itemIndex
			});
		}
	} else {
		const sessionKeyValue = ctx.getNodeParameter(customKey, itemIndex, "");
		sessionId = sessionKeyValue ? String(sessionKeyValue) : "";
		if (sessionId === "" || sessionId === "undefined") {
			throw new NodeOperationError(ctx.getNode(), "Key parameter is empty", {
				description: "Provide a key to use as session ID in the 'Key' parameter or use the 'Connected Chat Trigger Node' option to use the session ID from your Chat Trigger",
				itemIndex
			});
		}
	}
	
	return sessionId;
}

/**
 * Log AI events with proper error handling
 */
export function logAiEvent(executeFunctions: IExecuteFunctions, event: string, data?: any): void {
	try {
		if ('logAiEvent' in executeFunctions && typeof executeFunctions.logAiEvent === 'function') {
			// Type assertion for the logAiEvent method with proper data handling
			const logData = data ? jsonStringify(data) : undefined;
			(executeFunctions as any).logAiEvent(event, logData);
		} else {
			// Fallback logging
			console.log(`[AI Event] ${event}:`, data);
		}
	} catch (error) {
		if (executeFunctions.logger) {
			executeFunctions.logger.debug(`Error logging AI event: ${event}`, { error, data });
		} else {
			console.debug(`Error logging AI event: ${event}`, error);
		}
	}
}

/**
 * Serialize chat history to string format
 */
export function serializeChatHistory(chatHistory: any[]): string {
	return chatHistory.map((chatMessage) => {
		if (chatMessage._getType() === "human") {
			return `Human: ${chatMessage.content}`;
		} else if (chatMessage._getType() === "ai") {
			return `Assistant: ${chatMessage.content}`;
		} else {
			return `${chatMessage.content}`;
		}
	}).join("\n");
}

/**
 * Escape single curly brackets for template safety
 */
export function escapeSingleCurlyBrackets(text?: string): string | undefined {
	if (text === undefined) return undefined;
	
	let result = text;
	result = result
		.replace(/(?<!{){{{(?!{)/g, "{{{{")
		.replace(/(?<!})}}}(?!})/g, "}}}}")
		.replace(/(?<!{){(?!{)/g, "{{")
		.replace(/(?<!})}(?!})/g, "}}");
	
	return result;
}

/**
 * Enhanced getConnectedTools function with comprehensive tool discovery and validation
 * Based on OpenAI Assistant implementation with SAP AI Core adaptations
 */
export const getConnectedTools = async (
	ctx: IExecuteFunctions,
	enforceUniqueNames: boolean,
	convertStructuredTool: boolean = true,
	escapeCurlyBrackets: boolean = false
): Promise<any[]> => {
	try {
		// Get connected tools from the canvas
		const rawConnectedTools = await ctx.getInputConnectionData(NodeConnectionType.AiTool, 0);
		
		// Handle null/undefined case
		if (!rawConnectedTools) {
			return [];
		}
		
		// Ensure it's an array and expand toolkits
		const toolsArray = Array.isArray(rawConnectedTools) ? rawConnectedTools : [rawConnectedTools];
		const connectedTools = toolsArray.flatMap((toolOrToolkit: any) => {
			if (toolOrToolkit instanceof Toolkit) {
				return toolOrToolkit.getTools();
			}
			return toolOrToolkit;
		});
		
		// If not enforcing unique names, return as-is
		if (!enforceUniqueNames) {
			return connectedTools;
		}
		
		// Validate and process tools
		const seenNames = new Set<string>();
		const finalTools: any[] = [];
		
		for (const tool of connectedTools) {
			try {
				// Validate tool has required properties
				if (!tool || typeof tool !== 'object') {
					console.warn('Skipping invalid tool:', tool);
					continue;
				}
				
				const { name } = tool;
				if (!name || typeof name !== 'string') {
					console.warn('Skipping tool without valid name:', tool);
					continue;
				}
				
				// Check for duplicate names
				if (seenNames.has(name)) {
					throw new NodeOperationError(
						ctx.getNode(),
						`You have multiple tools with the same name: '${name}', please rename them to avoid conflicts`
					);
				}
				seenNames.add(name);
				
				// Escape curly brackets in description if requested
				if (escapeCurlyBrackets && tool.description) {
					tool.description = escapeSingleCurlyBrackets(tool.description) ?? tool.description;
				}
				
				// Convert N8nTool to DynamicTool if requested
				if (convertStructuredTool && tool instanceof N8nTool) {
					finalTools.push(tool.asDynamicTool());
				} else {
					finalTools.push(tool);
				}
				
			} catch (toolError) {
				// Log tool processing error but continue with other tools
				console.error(`Error processing tool ${tool?.name || 'unknown'}:`, toolError);
				logAiEvent(ctx, 'tool-processing-error', {
					toolName: tool?.name,
					error: toolError instanceof Error ? toolError.message : String(toolError)
				});
				
				// Re-throw if it's a duplicate name error (blocking)
				if (toolError instanceof NodeOperationError && toolError.message.includes('multiple tools with the same name')) {
					throw toolError;
				}
			}
		}
		
		// Log successful tool discovery
		logAiEvent(ctx, 'tools-connected', {
			toolCount: finalTools.length,
			toolNames: finalTools.map(t => t.name).filter(Boolean)
		});
		
		return finalTools;
		
	} catch (error) {
		// Log connection error
		logAiEvent(ctx, 'tool-connection-error', {
			error: error instanceof Error ? error.message : String(error)
		});
		
		// Re-throw NodeOperationErrors
		if (error instanceof NodeOperationError) {
			throw error;
		}
		
		// Wrap other errors
		throw new NodeOperationError(
			ctx.getNode(),
			`Failed to get connected tools: ${error instanceof Error ? error.message : String(error)}`
		);
	}
};

/**
 * Unwrap nested output structures
 */
export function unwrapNestedOutput(output: any): any {
	if (
		"output" in output &&
		Object.keys(output).length === 1 &&
		typeof output.output === "object" &&
		output.output !== null &&
		"output" in output.output &&
		Object.keys(output.output).length === 1
	) {
		return output.output;
	}
	return output;
}

/**
 * Check for long sequential character repeats (potential infinite loops)
 */
export function hasLongSequentialRepeat(text: string, threshold: number = 1000): boolean {
	try {
		if (
			text === null ||
			typeof text !== "string" ||
			text.length === 0 ||
			threshold <= 0 ||
			text.length < threshold
		) {
			return false;
		}
		
		const iterator = text[Symbol.iterator]();
		let prev = iterator.next();
		
		if (prev.done) {
			return false;
		}
		
		let count = 1;
		for (const char of iterator) {
			if (char === prev.value) {
				count++;
				if (count >= threshold) {
					return true;
				}
			} else {
				count = 1;
				prev = { value: char, done: false };
			}
		}
		
		return false;
	} catch (error) {
		return false;
	}
}

/**
 * Validate tool configuration
 */
export function validateTool(tool: any): { isValid: boolean; errors: string[] } {
	const errors: string[] = [];
	
	if (!tool || typeof tool !== 'object') {
		errors.push('Tool must be an object');
		return { isValid: false, errors };
	}
	
	if (!tool.name || typeof tool.name !== 'string') {
		errors.push('Tool must have a valid name');
	}
	
	if (!tool.description || typeof tool.description !== 'string') {
		errors.push('Tool must have a valid description');
	}
	
	if (!tool.func && !tool._call && typeof tool.func !== 'function' && typeof tool._call !== 'function') {
		errors.push('Tool must have a callable function (func or _call method)');
	}
	
	return {
		isValid: errors.length === 0,
		errors
	};
}

/**
 * Get tool information for debugging
 */
export function getToolInfo(tool: any): any {
	if (!tool || typeof tool !== 'object') {
		return { error: 'Invalid tool' };
	}
	
	return {
		name: tool.name,
		description: tool.description,
		hasFunc: typeof tool.func === 'function',
		hasCall: typeof tool._call === 'function',
		hasSchema: !!tool.schema,
		namespace: tool.lc_namespace,
		type: tool.constructor?.name,
		metadata: tool.metadata
	};
}

/**
 * Create a safe wrapper for tool execution
 */
export function createSafeToolWrapper(tool: any, ctx: IExecuteFunctions): any {
	const originalFunc = tool.func || tool._call;
	if (!originalFunc) {
		throw new Error(`Tool ${tool.name} has no executable function`);
	}
	
	const safeFunc = async (input: any) => {
		const startTime = Date.now();
		
		try {
			// Log tool execution start
			logAiEvent(ctx, 'tool-execution-start', {
				toolName: tool.name,
				input: typeof input === 'string' ? input.substring(0, 200) : 'object'
			});
			
			// Execute the tool
			const result = await originalFunc.call(tool, input);
			
			// Log successful execution
			const duration = Date.now() - startTime;
			logAiEvent(ctx, 'tool-execution-success', {
				toolName: tool.name,
				duration,
				resultType: typeof result
			});
			
			return result;
			
		} catch (error) {
			// Log execution error
			const duration = Date.now() - startTime;
			logAiEvent(ctx, 'tool-execution-error', {
				toolName: tool.name,
				duration,
				error: error instanceof Error ? error.message : String(error)
			});
			
			throw error;
		}
	};
	
	return {
		...tool,
		func: safeFunc,
		_call: safeFunc
	};
}

/**
 * Filter tools by capabilities
 */
export function filterToolsByCapability(tools: any[], capability: string): any[] {
	return tools.filter(tool => {
		if (tool.capabilities && Array.isArray(tool.capabilities)) {
			return tool.capabilities.includes(capability);
		}
		
		if (tool.metadata && tool.metadata.capabilities) {
			return tool.metadata.capabilities.includes(capability);
		}
		
		// Check if tool name or description contains capability
		const toolText = `${tool.name} ${tool.description}`.toLowerCase();
		return toolText.includes(capability.toLowerCase());
	});
}

/**
 * Sort tools by priority
 */
export function sortToolsByPriority(tools: any[]): any[] {
	return [...tools].sort((a, b) => {
		const aPriority = a.priority || a.metadata?.priority || 0;
		const bPriority = b.priority || b.metadata?.priority || 0;
		
		// Higher priority first
		return bPriority - aPriority;
	});
}

/**
 * Get tool statistics
 */
export function getToolStatistics(tools: any[]): any {
	const stats = {
		total: tools.length,
		byType: {} as Record<string, number>,
		byNamespace: {} as Record<string, number>,
		withSchema: 0,
		withMetadata: 0
	};
	
	tools.forEach(tool => {
		// Count by type
		const type = tool.constructor?.name || 'Unknown';
		stats.byType[type] = (stats.byType[type] || 0) + 1;
		
		// Count by namespace
		const namespace = tool.lc_namespace?.[0] || 'Unknown';
		stats.byNamespace[namespace] = (stats.byNamespace[namespace] || 0) + 1;
		
		// Count tools with schema
		if (tool.schema) {
			stats.withSchema++;
		}
		
		// Count tools with metadata
		if (tool.metadata) {
			stats.withMetadata++;
		}
	});
	
	return stats;
}