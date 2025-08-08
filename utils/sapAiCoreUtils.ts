import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Tool } from '@langchain/core/tools';

/**
 * Format a tool for SAP AI Core Function format
 * Similar to OpenAI function format but adapted for SAP AI Core
 */
export function formatToSapAiCoreFunction(tool: Tool): any {
	return {
		name: tool.name,
		description: tool.description,
		parameters: zodToJsonSchema((tool as any).schema || {})
	};
}

/**
 * Format a tool for SAP AI Core Tool format
 * Main format used by SAP AI Core for tool calling
 */
export function formatToSapAiCoreTool(tool: Tool): any {
	const schema = zodToJsonSchema((tool as any).schema || {});
	return {
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: schema
		}
	};
}

/**
 * Format a tool for SAP AI Core Assistant Tool format
 * Used specifically for assistant-style interactions
 */
export function formatToSapAiCoreAssistantTool(tool: Tool): any {
	return {
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: zodToJsonSchema((tool as any).schema || {})
		}
	};
}

/**
 * Validate tool schema for SAP AI Core compatibility
 */
export function validateSapAiCoreTool(tool: Tool): boolean {
	try {
		if (!tool.name || typeof tool.name !== 'string') {
			return false;
		}
		
		if (!tool.description || typeof tool.description !== 'string') {
			return false;
		}
		
		// Check if schema exists and is valid
		const schema = (tool as any).schema;
		if (schema) {
			zodToJsonSchema(schema);
		}
		
		return true;
	} catch (error) {
		console.warn(`Tool validation failed for ${tool.name}:`, error);
		return false;
	}
}

/**
 * Convert tools array to SAP AI Core format
 */
export function convertToolsToSapAiCoreFormat(tools: Tool[]): any[] {
	return tools
		.filter(validateSapAiCoreTool)
		.map(formatToSapAiCoreTool);
}

/**
 * Get tool by name from formatted tools array
 */
export function findToolByName(tools: any[], name: string): any | undefined {
	return tools.find(tool => 
		tool.function?.name === name || tool.name === name
	);
}

/**
 * Extract tool names from formatted tools array
 */
export function extractToolNames(tools: any[]): string[] {
	return tools.map(tool => tool.function?.name || tool.name).filter(Boolean);
}

/**
 * Prepare tool description with SAP AI Core specific formatting
 */
export function prepareSapAiCoreToolDescription(
	toolDescription: string, 
	schema?: any,
	additionalContext?: string
): string {
	let description = toolDescription;
	
	if (additionalContext) {
		description += `\n\nContext: ${additionalContext}`;
	}
	
	if (schema && schema.properties) {
		const parameters = Object.entries(schema.properties);
		if (parameters.length > 0) {
			description += `\n\nParameters:`;
			parameters.forEach(([name, paramSchema]: [string, any]) => {
				const required = schema.required?.includes(name) ? ' (required)' : ' (optional)';
				const type = paramSchema.type || 'any';
				const paramDesc = paramSchema.description || '';
				description += `\n- ${name}${required}: ${type} - ${paramDesc}`;
			});
		}
	}
	
	return description;
}