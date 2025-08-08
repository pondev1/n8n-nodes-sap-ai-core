// N8nLlmTracing.ts
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { getModelNameForTiktoken } from '@langchain/core/language_models/base';
import { NodeConnectionType, NodeError, NodeOperationError } from 'n8n-workflow';
import type { ISupplyDataFunctions } from 'n8n-workflow';

const TIKTOKEN_ESTIMATE_MODEL = 'gpt-4o';

// Simple pick function to avoid lodash dependency
function pick(object: any, keys: string[]): any {
	const result: any = {};
	for (const key of keys) {
		if (key in object) {
			result[key] = object[key];
		}
	}
	return result;
}

interface RunDetails {
	index: number;
	options: any;
	messages: any;
}

interface TokenUsage {
	completionTokens: number;
	promptTokens: number;
	totalTokens: number;
}

interface TracingOptions {
	tokensUsageParser?: (result: any) => TokenUsage;
	errorDescriptionMapper?: (error: any) => string;
}

export class N8nLlmTracing extends BaseCallbackHandler {
	name = 'N8nLlmTracing';
	awaitHandlers = true;
	connectionType = NodeConnectionType.AiLanguageModel;
	promptTokensEstimate = 0;
	completionTokensEstimate = 0;
	private parentRunIndex?: number;
	runsMap: Record<string, RunDetails> = {};
	options: TracingOptions;

	constructor(
		private executionFunctions: ISupplyDataFunctions,
		options?: TracingOptions
	) {
		super();
		this.options = {
			// Default(OpenAI format) parser
			tokensUsageParser: (result: any) => {
				const completionTokens = result?.llmOutput?.tokenUsage?.completionTokens ?? 0;
				const promptTokens = result?.llmOutput?.tokenUsage?.promptTokens ?? 0;
				return {
					completionTokens,
					promptTokens,
					totalTokens: completionTokens + promptTokens,
				};
			},
			errorDescriptionMapper: (error: any) => error.description,
			...options,
		};
	}

	async estimateTokensFromGeneration(generations: any[][]): Promise<number> {
		const messages = generations.flatMap((gen) => gen.map((g) => g.text));
		return await this.estimateTokensFromStringList(messages);
	}

	async estimateTokensFromStringList(list: string[]): Promise<number> {
		// Simple token estimation - you might want to implement actual tiktoken
		const text = list.join(' ');
		return Math.ceil(text.length / 4); // Rough estimate: 4 chars per token
	}

	async handleLLMEnd(output: any, runId: string): Promise<void> {
		const runDetails = this.runsMap[runId] ?? { 
			index: Object.keys(this.runsMap).length,
			options: {},
			messages: []
		};

		output.generations = output.generations.map(
			(gen: any) => gen.map((g: any) => pick(g, ['text', 'generationInfo']))
		);

		const tokenUsageEstimate: TokenUsage = {
			completionTokens: 0,
			promptTokens: 0,
			totalTokens: 0,
		};

		const tokenUsage = this.options.tokensUsageParser!(output);

		if (output.generations.length > 0) {
			tokenUsageEstimate.completionTokens = await this.estimateTokensFromGeneration(
				output.generations
			);
			tokenUsageEstimate.promptTokens = this.promptTokensEstimate;
			tokenUsageEstimate.totalTokens = 
				tokenUsageEstimate.completionTokens + this.promptTokensEstimate;
		}

		const response: any = {
			response: { generations: output.generations },
		};

		if (tokenUsage.completionTokens > 0) {
			response.tokenUsage = tokenUsage;
		} else {
			response.tokenUsageEstimate = tokenUsageEstimate;
		}

		const parsedMessages = typeof runDetails.messages === 'string' 
			? runDetails.messages 
			: runDetails.messages.map((message: any) => {
				if (typeof message === 'string') return message;
				if (typeof message?.toJSON === 'function') return message.toJSON();
				return message;
			});

		const sourceNodeRunIndex = this.parentRunIndex !== undefined 
			? this.parentRunIndex + runDetails.index 
			: undefined;

		// Fixed: Use correct number of parameters for addOutputData
		this.executionFunctions.addOutputData(
			this.connectionType,
			runDetails.index,
			[[{ json: { ...response } }]]
		);

		// Log AI event (simplified - you might want to implement actual logging)
		console.log('AI LLM generated output', {
			messages: parsedMessages,
			options: runDetails.options,
			response,
		});
	}

	async handleLLMStart(llm: any, prompts: string[], runId: string): Promise<void> {
		const estimatedTokens = await this.estimateTokensFromStringList(prompts);
		
		// Fixed: Create a simple index instead of using getNextRunIndex
		const currentIndex = Object.keys(this.runsMap).length;
		const sourceNodeRunIndex = this.parentRunIndex !== undefined 
			? this.parentRunIndex + currentIndex
			: undefined;

		const options = llm.type === 'constructor' ? llm.kwargs : llm;

		// Fixed: Use addInputData with correct parameters
		const inputResult = this.executionFunctions.addInputData(
			this.connectionType,
			[
				[
					{
						json: {
							messages: prompts,
							estimatedTokens,
							options,
						},
					},
				],
			]
		);

		this.runsMap[runId] = {
			index: inputResult?.index ?? currentIndex,
			options,
			messages: prompts,
		};

		this.promptTokensEstimate = estimatedTokens;
	}

	async handleLLMError(error: any, runId: string, parentRunId?: string): Promise<void> {
		const runDetails = this.runsMap[runId] ?? { 
			index: Object.keys(this.runsMap).length,
			options: {},
			messages: []
		};

		if (typeof error === 'object' && error?.hasOwnProperty('headers')) {
			const errorWithHeaders = error;
			Object.keys(errorWithHeaders.headers).forEach((key) => {
				if (!key.startsWith('x-')) {
					delete errorWithHeaders.headers[key];
				}
			});
		}

		if (error instanceof NodeError) {
			if (this.options.errorDescriptionMapper) {
				error.description = this.options.errorDescriptionMapper(error);
			}
			this.executionFunctions.addOutputData(this.connectionType, runDetails.index, error);
		} else {
			this.executionFunctions.addOutputData(
				this.connectionType,
				runDetails.index,
				new NodeOperationError(this.executionFunctions.getNode(), error, {
					functionality: 'configuration-node',
				})
			);
		}

		// Log AI event (simplified)
		console.log('AI LLM errored', {
			error: Object.keys(error).length === 0 ? error.toString() : error,
			runId,
			parentRunId,
		});
	}

	setParentRunIndex(runIndex: number): void {
		this.parentRunIndex = runIndex;
	}
}