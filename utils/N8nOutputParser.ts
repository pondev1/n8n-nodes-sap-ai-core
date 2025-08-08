import { IExecuteFunctions, NodeConnectionType } from 'n8n-workflow';

export async function getOptionalOutputParser(context: IExecuteFunctions): Promise<any> {
	// Get output parser from connection if available
	const outputParser = await context.getInputConnectionData(NodeConnectionType.AiOutputParser, 0);
	return outputParser || null;
}