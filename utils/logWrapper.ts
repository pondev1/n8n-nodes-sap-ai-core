import { 
	IExecuteFunctions, 
	ISupplyDataFunctions, 
	NodeConnectionType,
	NodeOperationError,
	deepCopy
} from 'n8n-workflow';
import { 
	logAiEvent, 
	isBaseChatMemory, 
	isBaseChatMessageHistory, 
	isToolsInstance 
} from './helpers';

// Import embeddings and other LangChain types
// Note: Adjust imports based on your LangChain version
import { Embeddings } from '@langchain/core/embeddings';
import { BaseRetriever } from '@langchain/core/retrievers';
import { VectorStore } from '@langchain/core/vectorstores';
import { TextSplitter } from '@langchain/textsplitters';

// Type for document compressor - adjust based on your LangChain version
interface BaseDocumentCompressor {
	compressDocuments(documents: any[], query: string): Promise<any[]>;
}

/**
 * Call method asynchronously with error handling
 */
async function callMethodAsync(parameters: {
	method: Function;
	arguments: any[];
	executeFunctions: IExecuteFunctions;
	connectionType: NodeConnectionType;
	currentNodeRunIndex: number;
	target?: any; // Add target to preserve 'this' context
}): Promise<any> {
	const { method, arguments: args, executeFunctions, connectionType, currentNodeRunIndex, target } = parameters;
	
	try {
		// Use target as 'this' context if provided, otherwise use null
		return await method.apply(target || null, args);
	} catch (e) {
		const connectedNode = executeFunctions.getNode();
		const error = new NodeOperationError(connectedNode, e as Error, {
			functionality: 'configuration-node'
		});
		
		if ('addOutputData' in executeFunctions) {
			(executeFunctions as any).addOutputData(
				connectionType,
				currentNodeRunIndex,
				error
			);
		}
		
		if (error.message) {
			if (!error.description) {
				error.description = error.message;
			}
			throw error;
		}
		
		throw new NodeOperationError(
			connectedNode,
			`Error on node "${connectedNode.name}" which is connected via input "${connectionType}"`
		);
	}
}

/**
 * Call method synchronously with error handling
 */
function callMethodSync(parameters: {
	method: Function;
	arguments: any[];
	executeFunctions: IExecuteFunctions;
	connectionType: NodeConnectionType;
	currentNodeRunIndex: number;
}): any {
	const { method, arguments: args, executeFunctions, connectionType, currentNodeRunIndex } = parameters;
	
	try {
		return method.apply(null, args);
	} catch (e) {
		const connectedNode = executeFunctions.getNode();
		const error = new NodeOperationError(connectedNode, e as Error);
		
		if ('addOutputData' in executeFunctions) {
			(executeFunctions as any).addOutputData(
				connectionType,
				currentNodeRunIndex,
				error
			);
		}
		
		throw new NodeOperationError(
			connectedNode,
			`Error on node "${connectedNode.name}" which is connected via input "${connectionType}"`
		);
	}
}

/**
 * Enhanced log wrapper with comprehensive monitoring
 * Based on OpenAI Assistant implementation with SAP AI Core adaptations
 */
export function logWrapper(
	originalInstance: any, 
	executeFunctions: IExecuteFunctions | ISupplyDataFunctions
): any {
	return new Proxy(originalInstance, {
		get: (target, prop) => {
			let connectionType: NodeConnectionType;
			
			// Memory handling
			if (isBaseChatMemory(originalInstance)) {
				if (prop === 'loadMemoryVariables' && 'loadMemoryVariables' in target) {
					return async (values: any) => {
						connectionType = NodeConnectionType.AiMemory;
						if ('addInputData' in executeFunctions) {
							const { index } = (executeFunctions as any).addInputData(connectionType, [
								[{ json: { action: 'loadMemoryVariables', values } }]
							]);
							
							const response = await callMethodAsync.call(target, {
								executeFunctions: executeFunctions as IExecuteFunctions,
								connectionType,
								currentNodeRunIndex: index,
								method: target[prop as string],
								arguments: [values]
							});
							
							const chatHistory = response?.chat_history ?? response;
							(executeFunctions as any).addOutputData(connectionType, index, [
								[{ json: { action: 'loadMemoryVariables', chatHistory } }]
							]);
							
							return response;
						}
						
						// Fallback without logging
						return await target[prop as string].call(target, values);
					};
				} else if (prop === 'saveContext' && 'saveContext' in target) {
					return async (input: any, output: any) => {
						connectionType = NodeConnectionType.AiMemory;
						if ('addInputData' in executeFunctions) {
							const { index } = (executeFunctions as any).addInputData(connectionType, [
								[{ json: { action: 'saveContext', input, output } }]
							]);
							
							const response = await callMethodAsync.call(target, {
								executeFunctions: executeFunctions as IExecuteFunctions,
								connectionType,
								currentNodeRunIndex: index,
								method: target[prop as string],
								arguments: [input, output]
							});
							
							const chatHistory = await target.chatHistory.getMessages();
							(executeFunctions as any).addOutputData(connectionType, index, [
								[{ json: { action: 'saveContext', chatHistory } }]
							]);
							
							return response;
						}
						
						// Fallback without logging
						return await target[prop as string].call(target, input, output);
					};
				}
			}
			
			// Chat message history handling
			if (isBaseChatMessageHistory(originalInstance)) {
				if (prop === 'getMessages' && 'getMessages' in target) {
					return async () => {
						connectionType = NodeConnectionType.AiMemory;
						if ('addInputData' in executeFunctions) {
							const { index } = (executeFunctions as any).addInputData(connectionType, [
								[{ json: { action: 'getMessages' } }]
							]);
							
							const response = await callMethodAsync.call(target, {
								executeFunctions: executeFunctions as IExecuteFunctions,
								connectionType,
								currentNodeRunIndex: index,
								method: target[prop as string],
								arguments: []
							});
							
							const payload = { action: 'getMessages', response };
							(executeFunctions as any).addOutputData(connectionType, index, [[{ json: payload }]]);
							logAiEvent(executeFunctions as IExecuteFunctions, 'ai-messages-retrieved-from-memory', { response });
							
							return response;
						}
						
						// Fallback without logging
						return await target[prop as string].call(target);
					};
				} else if (prop === 'addMessage' && 'addMessage' in target) {
					return async (message: any) => {
						connectionType = NodeConnectionType.AiMemory;
						const payload = { action: 'addMessage', message };
						
						if ('addInputData' in executeFunctions) {
							const { index } = (executeFunctions as any).addInputData(connectionType, [[{ json: payload }]]);
							
							await callMethodAsync.call(target, {
								executeFunctions: executeFunctions as IExecuteFunctions,
								connectionType,
								currentNodeRunIndex: index,
								method: target[prop as string],
								arguments: [message]
							});
							
							logAiEvent(executeFunctions as IExecuteFunctions, 'ai-message-added-to-memory', { message });
							(executeFunctions as any).addOutputData(connectionType, index, [[{ json: payload }]]);
						} else {
							// Fallback without logging
							await target[prop as string].call(target, message);
						}
					};
				}
			}
			
			// Retriever handling
			if (originalInstance instanceof BaseRetriever) {
				if (prop === 'getRelevantDocuments' && 'getRelevantDocuments' in target) {
					return async (query: string, config?: any) => {
						connectionType = NodeConnectionType.AiRetriever;
						if ('addInputData' in executeFunctions) {
							const { index } = (executeFunctions as any).addInputData(connectionType, [
								[{ json: { query, config } }]
							]);
							
							const response = await callMethodAsync.call(target, {
								executeFunctions: executeFunctions as IExecuteFunctions,
								connectionType,
								currentNodeRunIndex: index,
								method: target[prop as string],
								arguments: [query, config]
							});
							
							const executionId = response[0]?.metadata?.executionId;
							const workflowId = response[0]?.metadata?.workflowId;
							const metadata: any = {};
							
							if (executionId && workflowId) {
								metadata.subExecution = { executionId, workflowId };
							}
							
							logAiEvent(executeFunctions as IExecuteFunctions, 'ai-documents-retrieved', { query });
							(executeFunctions as any).addOutputData(
								connectionType,
								index,
								[[{ json: { response } }]],
								metadata
							);
							
							return response;
						}
						
						// Fallback without logging
						return await target[prop as string].call(target, query, config);
					};
				}
			}
			
			// Embeddings handling
			if (originalInstance instanceof Embeddings) {
				if (prop === 'embedDocuments' && 'embedDocuments' in target) {
					return async (documents: string[]) => {
						connectionType = NodeConnectionType.AiEmbedding;
						if ('addInputData' in executeFunctions) {
							const { index } = (executeFunctions as any).addInputData(connectionType, [
								[{ json: { documents } }]
							]);
							
							const response = await callMethodAsync({
								executeFunctions: executeFunctions as IExecuteFunctions,
								connectionType,
								currentNodeRunIndex: index,
								method: target[prop as string],
								arguments: [documents],
								target: target
							});
							
							logAiEvent(executeFunctions as IExecuteFunctions, 'ai-document-embedded');
							(executeFunctions as any).addOutputData(connectionType, index, [[{ json: { response } }]]);
							
							return response;
						}
						
						// Fallback without logging
						return await target[prop as string].call(target, documents);
					};
				}
				
				if (prop === 'embedQuery' && 'embedQuery' in target) {
					return async (query: string) => {
						connectionType = NodeConnectionType.AiEmbedding;
						if ('addInputData' in executeFunctions) {
							const { index } = (executeFunctions as any).addInputData(connectionType, [
								[{ json: { query } }]
							]);
							
							const response = await callMethodAsync({
								executeFunctions: executeFunctions as IExecuteFunctions,
								connectionType,
								currentNodeRunIndex: index,
								method: target[prop as string],
								arguments: [query],
								target: target
							});
							
							logAiEvent(executeFunctions as IExecuteFunctions, 'ai-query-embedded');
							(executeFunctions as any).addOutputData(connectionType, index, [[{ json: { response } }]]);
							
							return response;
						}
						
						// Fallback without logging
						return await target[prop as string].call(target, query);
					};
				}
			}
			
			// Document compressor handling
			if ('compressDocuments' in originalInstance) {
				if (prop === 'compressDocuments' && 'compressDocuments' in target) {
					return async (documents: any[], query: string) => {
						// Use a custom connection type since AiReranker might not exist
						connectionType = 'ai-document-compressor' as NodeConnectionType;
						if ('addInputData' in executeFunctions) {
							const { index } = (executeFunctions as any).addInputData(connectionType, [
								[{ json: { query, documents } }]
							]);
							
							const response = await callMethodAsync.call(target, {
								executeFunctions: executeFunctions as IExecuteFunctions,
								connectionType,
								currentNodeRunIndex: index,
								method: target[prop as string],
								arguments: [deepCopy(documents), query]
							});
							
							logAiEvent(executeFunctions as IExecuteFunctions, 'ai-document-reranked', { query });
							(executeFunctions as any).addOutputData(connectionType, index, [[{ json: { response } }]]);
							
							return response;
						}
						
						// Fallback without logging
						return await target[prop as string].call(target, deepCopy(documents), query);
					};
				}
			}
			
			// Text splitter handling
			if (originalInstance instanceof TextSplitter) {
				if (prop === 'splitText' && 'splitText' in target) {
					return async (text: string) => {
						connectionType = NodeConnectionType.AiTextSplitter;
						if ('addInputData' in executeFunctions) {
							const { index } = (executeFunctions as any).addInputData(connectionType, [
								[{ json: { textSplitter: text } }]
							]);
							
							const response = await callMethodAsync.call(target, {
								executeFunctions: executeFunctions as IExecuteFunctions,
								connectionType,
								currentNodeRunIndex: index,
								method: target[prop as string],
								arguments: [text]
							});
							
							logAiEvent(executeFunctions as IExecuteFunctions, 'ai-text-split');
							(executeFunctions as any).addOutputData(connectionType, index, [[{ json: { response } }]]);
							
							return response;
						}
						
						// Fallback without logging
						return await target[prop as string].call(target, text);
					};
				}
			}
			
			// Tool execution handling
			if (isToolsInstance(originalInstance)) {
				if (prop === '_call' && '_call' in target) {
					return async (query: any) => {
						connectionType = NodeConnectionType.AiTool;
						const inputData: any = { query };
						
						if ((target as any).metadata?.isFromToolkit) {
							inputData.tool = {
								name: (target as any).name,
								description: (target as any).description
							};
						}
						
						if ('addInputData' in executeFunctions) {
							const { index } = (executeFunctions as any).addInputData(connectionType, [
								[{ json: inputData }]
							]);
							
							const response = await callMethodAsync.call(target, {
								executeFunctions: executeFunctions as IExecuteFunctions,
								connectionType,
								currentNodeRunIndex: index,
								method: target[prop as string],
								arguments: [query]
							});
							
							logAiEvent(executeFunctions as IExecuteFunctions, 'ai-tool-called', { ...inputData, response });
							(executeFunctions as any).addOutputData(connectionType, index, [[{ json: { response } }]]);
							
							return typeof response === 'string' ? response : JSON.stringify(response);
						}
						
						// Fallback without logging
						const response = await target[prop as string].call(target, query);
						return typeof response === 'string' ? response : JSON.stringify(response);
					};
				}
			}
			
			// Vector store handling
			if (originalInstance instanceof VectorStore) {
				if (prop === 'similaritySearch' && 'similaritySearch' in target) {
					return async (query: string, k?: number, filter?: any, _callbacks?: any) => {
						connectionType = NodeConnectionType.AiVectorStore;
						if ('addInputData' in executeFunctions) {
							const { index } = (executeFunctions as any).addInputData(connectionType, [
								[{ json: { query, k, filter } }]
							]);
							
							const response = await callMethodAsync.call(target, {
								executeFunctions: executeFunctions as IExecuteFunctions,
								connectionType,
								currentNodeRunIndex: index,
								method: target[prop as string],
								arguments: [query, k, filter, _callbacks]
							});
							
							logAiEvent(executeFunctions as IExecuteFunctions, 'ai-vector-store-searched', { query });
							(executeFunctions as any).addOutputData(connectionType, index, [[{ json: { response } }]]);
							
							return response;
						}
						
						// Fallback without logging
						return await target[prop as string].call(target, query, k, filter, _callbacks);
					};
				}
			}
			
			return target[prop as string];
		}
	});
}

/**
 * Create a logging wrapper specifically for SAP AI Core components
 */
export function createSapAiCoreLogger<T extends object>(
	component: T,
	context: IExecuteFunctions | ISupplyDataFunctions,
): T {
	return logWrapper(component, context);
}

/**
 * Performance logging utility for SAP AI Core
 */
export function withPerformanceLogging<T extends (...args: any[]) => any>(
	fn: T,
	context: IExecuteFunctions,
	operationName: string,
): T {
	return ((...args: any[]) => {
		const startTime = Date.now();
		const nodeName = context.getNode().name;
		
		try {
			const result = fn(...args);
			
			// Handle promises
			if (result && typeof result.then === 'function') {
				return result.finally(() => {
					const duration = Date.now() - startTime;
					logAiEvent(context, 'sap-ai-core-performance', {
						operation: operationName,
						duration,
						node: nodeName
					});
				});
			}
			
			const duration = Date.now() - startTime;
			logAiEvent(context, 'sap-ai-core-performance', {
				operation: operationName,
				duration,
				node: nodeName
			});
			
			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			logAiEvent(context, 'sap-ai-core-error', {
				operation: operationName,
				duration,
				error: error instanceof Error ? error.message : String(error),
				node: nodeName
			});
			throw error;
		}
	}) as T;
}