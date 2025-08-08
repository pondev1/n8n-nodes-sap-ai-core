import { NodeOperationError, jsonParse } from 'n8n-workflow';
import type { IExecuteFunctions } from 'n8n-workflow';

// Alternative JSON schema generation - using a simple implementation since external packages aren't available
function generateSchemaFromObject(obj: any): any {
	if (obj === null) return { type: 'null' };
	if (typeof obj === 'boolean') return { type: 'boolean' };
	if (typeof obj === 'number') return { type: 'number' };
	if (typeof obj === 'string') return { type: 'string' };
	
	if (Array.isArray(obj)) {
		return {
			type: 'array',
			items: obj.length > 0 ? generateSchemaFromObject(obj[0]) : { type: 'string' }
		};
	}
	
	if (typeof obj === 'object') {
		const properties: Record<string, any> = {};
		const required: string[] = [];
		
		for (const [key, value] of Object.entries(obj)) {
			properties[key] = generateSchemaFromObject(value);
			required.push(key);
		}
		
		return {
			type: 'object',
			properties,
			required
		};
	}
	
	return { type: 'string' };
}

/**
 * Check if a property schema is a valid property schema object
 */
function isPropertySchema(property: any): boolean {
	return typeof property === "object" && property !== null && "type" in property;
}

/**
 * Make all properties in a schema required recursively
 */
function makeAllPropertiesRequired(schema: any): any {
	if (schema.type === "object" && schema.properties) {
		const properties = Object.keys(schema.properties);
		if (properties.length > 0) {
			schema.required = properties;
		}
		
		// Recursively process nested objects
		for (const key of properties) {
			if (isPropertySchema(schema.properties[key])) {
				schema.properties[key] = makeAllPropertiesRequired(schema.properties[key]);
			}
		}
	}
	
	// Handle array items
	if (schema.type === "array" && schema.items && isPropertySchema(schema.items)) {
		schema.items = makeAllPropertiesRequired(schema.items);
	}
	
	return schema;
}

/**
 * Generate JSON schema from example JSON string
 */
export function generateSchemaFromExample(
	exampleJsonString: string, 
	allFieldsRequired: boolean = false
): any {
	try {
		const parsedExample = jsonParse(exampleJsonString);
		const schema = generateSchemaFromObject(parsedExample);
		
		if (allFieldsRequired) {
			return makeAllPropertiesRequired(schema);
		}
		
		return schema;
	} catch (error) {
		throw new Error(`Failed to generate schema from example: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Convert JSON schema to Zod-like schema (simplified implementation)
 */
export function convertJsonSchemaToZod(schema: any): any {
	// Since we don't have the actual zod library, we'll return a simplified representation
	// This should be replaced with actual zod conversion when the library is available
	try {
		return {
			_type: 'ZodSchema',
			_schema: schema,
			parse: (data: any) => {
				// Basic validation logic
				return validateDataAgainstSchema(data, schema);
			}
		};
	} catch (error) {
		throw new Error(`Failed to convert JSON schema to Zod: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Basic validation function for data against schema
 */
function validateDataAgainstSchema(data: any, schema: any): any {
	if (!schema || typeof schema !== 'object') {
		return data;
	}
	
	switch (schema.type) {
		case 'string':
			if (typeof data !== 'string') {
				throw new Error(`Expected string, got ${typeof data}`);
			}
			break;
		case 'number':
			if (typeof data !== 'number') {
				throw new Error(`Expected number, got ${typeof data}`);
			}
			break;
		case 'boolean':
			if (typeof data !== 'boolean') {
				throw new Error(`Expected boolean, got ${typeof data}`);
			}
			break;
		case 'array':
			if (!Array.isArray(data)) {
				throw new Error(`Expected array, got ${typeof data}`);
			}
			break;
		case 'object':
			if (typeof data !== 'object' || data === null || Array.isArray(data)) {
				throw new Error(`Expected object, got ${typeof data}`);
			}
			
			// Check required properties
			if (schema.required && Array.isArray(schema.required)) {
				for (const requiredProp of schema.required) {
					if (!(requiredProp in data)) {
						throw new Error(`Missing required property: ${requiredProp}`);
					}
				}
			}
			break;
	}
	
	return data;
}

/**
 * Validate a JSON schema
 */
export function validateJsonSchema(schema: any): boolean {
	try {
		// Basic validation - check for required fields
		if (typeof schema !== 'object' || schema === null) {
			return false;
		}
		
		// Must have a type
		if (!schema.type) {
			return false;
		}
		
		// If object type, should have properties
		if (schema.type === 'object' && !schema.properties) {
			return false;
		}
		
		// If array type, should have items
		if (schema.type === 'array' && !schema.items) {
			return false;
		}
		
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Sanitize schema by removing unsupported features
 */
export function sanitizeSchema(schema: any): any {
	// Remove $ref as they're not supported
	const sanitized = JSON.parse(JSON.stringify(schema));
	
	function removeRefs(obj: any): any {
		if (typeof obj !== 'object' || obj === null) {
			return obj;
		}
		
		if (Array.isArray(obj)) {
			return obj.map(removeRefs);
		}
		
		const result: any = {};
		for (const [key, value] of Object.entries(obj)) {
			if (key === '$ref') {
				// Skip $ref properties
				continue;
			}
			result[key] = removeRefs(value);
		}
		
		return result;
	}
	
	return removeRefs(sanitized);
}

/**
 * Prepare fallback tool description with schema information
 */
export function prepareFallbackToolDescription(
	toolDescription: string, 
	schema?: any
): string {
	let description = toolDescription || 'A tool for performing actions';
	
	if (schema && schema.properties) {
		const toolParameters = Object.entries(schema.properties);
		if (toolParameters.length > 0) {
			description += `\n\nTool expects valid stringified JSON object with ${toolParameters.length} properties.`;
			description += '\nProperty names with description, type and required status:';
			
			toolParameters.forEach(([name, paramSchema]: [string, any]) => {
				const type = getSimplifiedType(paramSchema);
				const required = schema.required?.includes(name) ?? false;
				const paramDesc = paramSchema.description || '';
				
				description += `\n${name}: (description: ${paramDesc}, type: ${type}, required: ${required})`;
			});
			
			description += '\nALL parameters marked as required must be provided';
		}
	}
	
	return description;
}

/**
 * Get simplified type from schema
 */
function getSimplifiedType(schema: any): string {
	if (!schema || typeof schema !== 'object') {
		return 'string';
	}
	
	// Handle Zod-like schemas
	if (schema._def) {
		const typeName = schema._def.typeName;
		switch (typeName) {
			case 'ZodObject':
				return 'object';
			case 'ZodNumber':
				return 'number';
			case 'ZodBoolean':
				return 'boolean';
			case 'ZodArray':
				return 'array';
			case 'ZodString':
				return 'string';
			case 'ZodNullable':
			case 'ZodOptional':
				return getSimplifiedType(schema._def.innerType);
			default:
				return 'string';
		}
	}
	
	// Handle JSON Schema
	if (schema.type) {
		switch (schema.type) {
			case 'object':
				return 'object';
			case 'number':
			case 'integer':
				return 'number';
			case 'boolean':
				return 'boolean';
			case 'array':
				return 'array';
			case 'string':
			default:
				return 'string';
		}
	}
	
	return 'string';
}

/**
 * Throw error if tool schema is invalid for SAP AI Core
 */
export function throwIfInvalidToolSchema(ctx: IExecuteFunctions, error: any): void {
	if (error?.message?.includes("tool input did not match expected schema")) {
		throw new NodeOperationError(
			ctx.getNode(),
			`${error.message}.
			This is most likely because some of your tools are configured to require a specific schema. 
			Please check the tool configuration and ensure the schema is valid for SAP AI Core.
			Tools should have proper JSON schema definitions with required fields marked correctly.`
		);
	}
}

/**
 * Extract schema from tool definition
 */
export function extractSchemaFromTool(tool: any): any | null {
	// Try different possible schema locations
	if (tool.schema) {
		return tool.schema;
	}
	
	if (tool.args_schema) {
		return tool.args_schema;
	}
	
	if (tool.parameters) {
		return tool.parameters;
	}
	
	if (tool.function?.parameters) {
		return tool.function.parameters;
	}
	
	return null;
}

/**
 * Merge multiple schemas into one
 */
export function mergeSchemas(schemas: any[]): any {
	if (schemas.length === 0) {
		return { type: 'object', properties: {} };
	}
	
	if (schemas.length === 1) {
		return schemas[0];
	}
	
	const merged = {
		type: 'object',
		properties: {} as Record<string, any>,
		required: [] as string[]
	};
	
	schemas.forEach(schema => {
		if (schema.properties) {
			Object.assign(merged.properties, schema.properties);
		}
		
		if (schema.required && Array.isArray(schema.required)) {
			merged.required.push(...schema.required);
		}
	});
	
	// Remove duplicate required fields
	merged.required = [...new Set(merged.required)];
	
	return merged;
}

/**
 * Create a basic schema validator
 */
export function createSchemaValidator(schema: any) {
	return {
		validate: (data: any) => {
			try {
				validateDataAgainstSchema(data, schema);
				return { valid: true, errors: [] };
			} catch (error) {
				return { 
					valid: false, 
					errors: [error instanceof Error ? error.message : String(error)] 
				};
			}
		},
		schema
	};
}

/**
 * Convert schema to OpenAPI format
 */
export function convertToOpenApiSchema(schema: any): any {
	if (!schema || typeof schema !== 'object') {
		return { type: 'string' };
	}
	
	// Already in correct format
	if (schema.type) {
		return schema;
	}
	
	// Convert from other formats
	return generateSchemaFromObject(schema);
}

/**
 * Simplify complex schema for SAP AI Core compatibility
 */
export function simplifySchemaForSapAiCore(schema: any): any {
	if (!schema || typeof schema !== 'object') {
		return { type: 'string' };
	}
	
	const simplified = { ...schema };
	
	// Remove complex features not supported by SAP AI Core
	delete simplified.$schema;
	delete simplified.$id;
	delete simplified.definitions;
	delete simplified.allOf;
	delete simplified.anyOf;
	delete simplified.oneOf;
	delete simplified.not;
	
	// Simplify nested objects recursively
	if (simplified.properties) {
		const newProperties: Record<string, any> = {};
		for (const [key, value] of Object.entries(simplified.properties)) {
			newProperties[key] = simplifySchemaForSapAiCore(value);
		}
		simplified.properties = newProperties;
	}
	
	// Simplify array items
	if (simplified.items) {
		simplified.items = simplifySchemaForSapAiCore(simplified.items);
	}
	
	return simplified;
}