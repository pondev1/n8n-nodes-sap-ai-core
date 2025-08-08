import { DynamicTool } from '@langchain/core/tools';

/**
 * N8N specific tool implementation
 */
export class N8nTool {
	name: string;
	description: string;
	private func: (input: string) => Promise<string>;
	
	constructor(config: {
		name: string;
		description: string;
		schema?: any;
		func: (input: string) => Promise<string>;
	}) {
		this.name = config.name;
		this.description = config.description;
		this.func = config.func;
	}

	/**
	 * Convert to DynamicTool for compatibility
	 */
	asDynamicTool(): DynamicTool {
		return new DynamicTool({
			name: this.name,
			description: this.description,
			func: this.func.bind(this)
		});
	}
}