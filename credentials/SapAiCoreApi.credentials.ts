import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SapAiCoreApi implements ICredentialType {
	name = 'sapAiCoreApi';
	displayName = 'SAP AI Core API';
	documentationUrl = 'https://help.sap.com/docs/sap-ai-core';
	properties: INodeProperties[] = [
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
			description: 'OAuth2 Client ID for SAP AI Core (format: sb-xxxxxx!xxxx|aicore!xxxx)',
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'OAuth2 Client Secret for SAP AI Core',
		},
		{
			displayName: 'OAuth URL',
			name: 'oauthUrl',
			type: 'string',
			default: '',
			placeholder: 'https://your-subaccount.authentication.eu10.hana.ondemand.com',
			required: true,
			description: 'OAuth2 endpoint URL for authentication',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			placeholder: 'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com',
			required: true,
			description: 'Base URL for SAP AI Core API',
		},
	];

	// No test method = credentials are always considered valid
	// OAuth2 authentication will be validated when the node actually executes
	// This is the recommended approach for OAuth2 credentials in n8n
}