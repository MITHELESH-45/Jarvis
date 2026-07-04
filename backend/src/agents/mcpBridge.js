const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { DynamicStructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:5001';

// ─── Singleton MCP Client ─────────────────────────────────────────────────────
// We maintain ONE persistent client connection to the MCP Server for the
// lifetime of the Express process. Creating a new SSE connection per request
// causes "stream is not readable" because closing the client tears down the
// underlying HTTP stream that the server has already removed from its map.
let _mcpClient = null;
let _langChainTools = null;
let _isConnecting = false;

async function getOrCreateMcpClient() {
  // Already connected and tools loaded — reuse
  if (_mcpClient && _langChainTools) {
    return { client: _mcpClient, langChainTools: _langChainTools };
  }

  // Guard against concurrent connection attempts
  if (_isConnecting) {
    // Poll until the connection is established (max 10s)
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (_mcpClient && _langChainTools) {
        return { client: _mcpClient, langChainTools: _langChainTools };
      }
    }
    throw new Error('MCP Client connection timed out waiting for concurrent attempt.');
  }

  _isConnecting = true;
  try {
    console.log('[MCP Bridge] Establishing persistent connection to MCP Server...');
    const client = new Client({ name: 'jarvis-orchestrator', version: '1.0.0' });
    const transport = new SSEClientTransport(new URL(`${MCP_SERVER_URL}/sse`));

    await client.connect(transport);
    console.log('[MCP Bridge] Connected to MCP Server at', MCP_SERVER_URL);

    const toolsResponse = await client.listTools();
    const mcpTools = toolsResponse.tools || [];
    console.log(`[MCP Bridge] Registered ${mcpTools.length} tools:`, mcpTools.map((t) => t.name));

    const langChainTools = convertMcpToolsToLangChain(mcpTools, client);

    // Cache globally
    _mcpClient = client;
    _langChainTools = langChainTools;

    // If the connection drops, reset so the next request reconnects
    transport.onclose = () => {
      console.warn('[MCP Bridge] SSE connection closed. Will reconnect on next request.');
      _mcpClient = null;
      _langChainTools = null;
    };
    transport.onerror = (err) => {
      console.error('[MCP Bridge] SSE transport error:', err.message);
      _mcpClient = null;
      _langChainTools = null;
    };

    return { client, langChainTools };
  } finally {
    _isConnecting = false;
  }
}

// ─── JSON Schema → Zod Converter ─────────────────────────────────────────────
function jsonSchemaPropertiesToZod(properties = {}, required = []) {
  const shape = {};
  for (const [key, def] of Object.entries(properties)) {
    let zodType;
    switch (def.type) {
      case 'number':   zodType = z.number(); break;
      case 'integer':  zodType = z.number().int(); break;
      case 'boolean':  zodType = z.boolean(); break;
      case 'array':    zodType = z.array(z.unknown()); break;
      case 'string':
      default:         zodType = z.string(); break;
    }
    if (def.description) zodType = zodType.describe(def.description);
    shape[key] = required.includes(key) ? zodType : zodType.optional();
  }
  return z.object(shape);
}

// ─── MCP Tool → LangChain Tool Converter ─────────────────────────────────────
function convertMcpToolsToLangChain(mcpTools, mcpClient) {
  return mcpTools.map((mcpTool) => {
    const inputSchema = mcpTool.inputSchema || {};
    const schema = jsonSchemaPropertiesToZod(
      inputSchema.properties || {},
      inputSchema.required || []
    );

    return new DynamicStructuredTool({
      name: mcpTool.name,
      description: mcpTool.description || `MCP Tool: ${mcpTool.name}`,
      schema,
      func: async (args) => {
        try {
          console.log(`[MCP Bridge] Invoking remote tool: ${mcpTool.name}`, args);
          const result = await mcpClient.callTool({ name: mcpTool.name, arguments: args });

          if (result.content && Array.isArray(result.content)) {
            const textParts = result.content.filter((c) => c.type === 'text').map((c) => c.text);
            return textParts.join('\n') || 'Tool executed successfully.';
          }
          return JSON.stringify(result);
        } catch (err) {
          // On tool call failure, reset the singleton so next request reconnects
          console.error(`[MCP Bridge] Error calling remote tool ${mcpTool.name}:`, err.message);
          _mcpClient = null;
          _langChainTools = null;
          return `Error executing ${mcpTool.name}: ${err.message}`;
        }
      },
    });
  });
}

module.exports = { getMcpLangChainTools: getOrCreateMcpClient };
