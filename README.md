# SAP AI Core LLM Node for n8n

A custom n8n community node that enables integration with SAP AI Core's LLM models for text generation and chat completion tasks.

## Features

- **Text Generation**: Generate text using deployed LLM models in SAP AI Core
- **Chat Completion**: Interactive chat with conversation context
- **OAuth2 Authentication**: Support for OAuth2 authentication with SAP AI Core
- **Flexible Configuration**: Customizable parameters like temperature, max tokens, top-p, and stop sequences
- **Error Handling**: Robust error handling with optional continue-on-fail behavior

## Prerequisites

- n8n instance (self-hosted or cloud)
- SAP BTP account with AI Core service enabled
- Deployed LLM model in SAP AI Core
- Valid SAP AI Core OAuth2 credentials

## Installation

### Option 1: Install via n8n Community Nodes (Recommended)

1. In your n8n instance, go to **Settings** > **Community Nodes**
2. Click **Install a community node**
3. Enter the package name: `n8n-nodes-sap-ai-core`
4. Click **Install**

### Option 2: Manual Installation for Self-Hosted n8n

1. Navigate to your n8n installation directory
2. Install the package:
   ```bash
   npm install n8n-nodes-sap-ai-core
   ```
3. Restart your n8n instance

### Option 3: Development Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/pondev1/n8n-nodes-sap-ai-core.git
   cd n8n-nodes-sap-ai-core
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the node:
   ```bash
   npm run build
   ```

4. Package and install locally:
   ```bash
   npm pack
   npm install "C:\path\to\n8n-nodes-sap-ai-core\n8n-nodes-sap-ai-core-1.0.0.tgz"
   ```

5. Set custom extensions path (Windows):
   ```powershell
   $env:N8N_CUSTOM_EXTENSIONS = "C:\Users\yourusername\.n8n\custom\node_modules"
   npx n8n start
   ```

## SAP AI Core Setup

### 1. Deploy an LLM Model

First, ensure you have an LLM model deployed in SAP AI Core:

1. Access SAP AI Launchpad
2. Navigate to **ML Operations** > **Deployments**
3. Create a new deployment with your desired LLM model
4. Note the **Deployment ID** - you'll need this for the n8n node configuration

### 2. Get Authentication Credentials

1. In SAP BTP Cockpit, navigate to **Services** > **Instances and Subscriptions**
2. Find your AI Core service instance
3. Create a service key
4. Extract the following fields from the service key JSON:
   - Client ID (from service key "clientid")
   - Client Secret (from service key "clientsecret")
   - OAuth URL (from service key "url" field)
   - Base URL (from service key "serviceurls.AI_API_URL")

## Node Configuration

### 1. Credentials Setup

1. In n8n, go to **Credentials** and click **Add Credential**
2. Search for and select **SAP AI Core API**
3. Fill in the required fields:
   - **Client ID**: Your OAuth2 client ID (from service key "clientid")
   - **Client Secret**: Your OAuth2 client secret (from service key "clientsecret")
   - **OAuth URL**: Your OAuth2 token endpoint (from service key "url")
   - **Base URL**: Your SAP AI Core API endpoint (from service key "serviceurls.AI_API_URL")

4. Save the credentials

### 2. Node Configuration

1. Add the **SAP AI Core LLM** node to your workflow
2. Configure the following parameters:

   **Required Parameters:**
   - **Credentials**: Select your SAP AI Core API credentials
   - **Operation**: Choose between "Generate Text" or "Chat Completion"
   - **Model**: Your model name (e.g., "gpt-35-turbo")
   - **Resource Group**: SAP AI Core resource group (usually "default")
   - **Deployment ID**: The deployment ID from SAP AI Launchpad

   **Operation-Specific Parameters:**
   
   *For Generate Text:*
   - **Prompt**: The text prompt to send to the model

   *For Chat Completion:*
   - **Messages**: Array of conversation messages with roles (system, user, assistant)

   **Optional Parameters:**
   - **Max Tokens**: Maximum number of tokens to generate (default: 100)
   - **Temperature**: Controls randomness (0-2, default: 0.7)
   - **Top P**: Controls diversity via nucleus sampling (0-1, default: 1)
   - **Stop Sequences**: Comma-separated list of stop sequences

## Usage Examples

### Basic Text Generation

```json
{
  "operation": "generateText",
  "model": "gpt-35-turbo",
  "resourceGroup": "default",
  "deploymentId": "dabcd1234567890", // your-deployment-id
  "prompt": "Write a brief summary of artificial intelligence."
}
```

### Chat Completion

```json
{
  "operation": "chatCompletion",
  "model": "gpt-35-turbo",
  "resourceGroup": "default",
  "deploymentId": "dabcd1234567890", // your-deployment-id
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "What is machine learning?"
    }
  ]
}
```

### Advanced Configuration with Custom Parameters

```json
{
  "operation": "generateText",
  "model": "gpt-35-turbo",
  "prompt": "Generate a creative story about robots.",
  "additionalOptions": {
    "max_tokens": 500,
    "temperature": 0.8,
    "top_p": 0.9,
    "stop": "The End, END, ."
  }
}
```

## Sample Workflows

Ready-to-use n8n workflow examples are available in the `workflows/` directory:

### 1. AI Core Chat Model Workflow
**File**: [`workflows/AI Core Chat Model.json`](./workflows/AI%20Core%20Chat%20Model.json)

Demonstrates basic chat functionality using SAP AI Core chat models. This workflow shows how to configure and use the chat model for interactive conversations.

**Features**:
- Simple chat model configuration
- Direct chat interaction
- Response handling and formatting

### 2. AI Core LLM Agent Workflow
**File**: [`workflows/AI Core LLM Agent.json`](./workflows/AI%20Core%20LLM%20Agent.json)

Advanced workflow showing SAP AI Core integration with LLM agents for complex AI-powered automation tasks.

**Features**:
- LLM agent configuration
- Advanced AI workflows
- Tool integration capabilities

### How to Use Sample Workflows

1. Download the desired workflow JSON file
2. In n8n, go to **Workflows** > **Import from File**
3. Select the downloaded JSON file
4. Configure your SAP AI Core credentials
5. Update the `deploymentId` with your actual deployment ID
6. Activate and test the workflow

## Response Format

The node returns a JSON object containing:

```json
{
  "id": "response-id",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-35-turbo",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Generated text response..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 50,
    "total_tokens": 60
  },
  "operation": "chatCompletion",
  "deploymentId": "dabcd1234567890", // your-deployment-id
  "resourceGroup": "default"
}
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify your credentials are correct
   - Check that your OAuth2 URL is accessible
   - Ensure your service key fields are properly extracted

2. **Deployment Not Found**
   - Verify the deployment ID is correct
   - Check that the deployment is in "Running" status in SAP AI Launchpad
   - Ensure the resource group matches your deployment

3. **Model Errors**
   - Verify the model name matches your deployment configuration
   - Check that your prompt format is compatible with the deployed model

4. **Rate Limiting**
   - SAP AI Core may have rate limits - implement appropriate delays between requests
   - Monitor your usage in SAP AI Launchpad

### Error Codes

- **401**: Authentication failed - check credentials
- **403**: Insufficient permissions - verify resource group access
- **404**: Deployment not found - check deployment ID
- **429**: Rate limit exceeded - reduce request frequency
- **500**: Internal server error - check SAP AI Core service status

## Development

To contribute to this project:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

### Build Commands

- `npm run build`: Build the project
- `npm run dev`: Build in watch mode
- `npm run lint`: Run linting
- `npm run format`: Format code

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Support

For issues and questions:

1. Check the [troubleshooting section](#troubleshooting)
2. Review [SAP AI Core documentation](https://help.sap.com/docs/AI_CORE)
3. Open an issue on GitHub
4. Contact the maintainers

## Changelog

### v1.0.0
- Initial release
- Support for text generation and chat completion
- OAuth2 authentication
- Basic error handling and configuration options