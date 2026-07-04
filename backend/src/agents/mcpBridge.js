const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { DynamicStructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:5001';

// ─── JSON Schema → Zod Converter ─────────────────────────────────────────────
/**
 * Converts a flat JSON Schema "properties" object into a Zod object schema.
 * Handles string, number, integer, boolean, and array types.
 * @param {Object} properties - The JSON Schema properties map.
 * @param {string[]} required - List of required property names.
 * @returns {z.ZodObject}
 */
function jsonSchemaPropertiesToZod(properties = {}, required = []) {
  const shape = {};
  for (const [key, def] of Object.entries(properties)) {
    let zodType;
    switch (def.type) {
      case 'number':
        zodType = z.number();
        break;
      case 'integer':
        zodType = z.number().int();
        break;
      case 'boolean':
        zodType = z.boolean();
        break;
      case 'array':
        zodType = z.array(z.unknown());
        break;
      case 'string':
      default:
        zodType = z.string();
        break;
    }
    if (def.description) {
      zodType = zodType.describe(def.description);
    }
    // Make field optional if not in required list
    shape[key] = required.includes(key) ? zodType : zodType.optional();
  }
  return z.object(shape);
}

// ─── MCP Tool → LangChain Tool Converter ─────────────────────────────────────
/**
 * Converts an array of MCP tool definitions into LangChain DynamicStructuredTool instances.
 * The tool's `func` calls back to the MCP Client to execute the tool remotely on the MCP Server.
 *
 * @param {Object[]} mcpTools - Tool definitions returned by client.listTools().
 * @param {Client} mcpClient - The live MCP client used to invoke tools.
 * @returns {DynamicStructuredTool[]}
 */
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
          const result = await mcpClient.callTool({
            name: mcpTool.name,
            arguments: args,
          });

          // Extract text content from MCP response
          if (result.content && Array.isArray(result.content)) {
            const textParts = result.content
              .filter((c) => c.type === 'text')
              .map((c) => c.text);
            return textParts.join('\n') || 'Tool executed successfully.';
          }
          return JSON.stringify(result);
        } catch (err) {
          console.error(`[MCP Bridge] Error calling remote tool ${mcpTool.name}:`, err);
          return `Error executing ${mcpTool.name}: ${err.message}`;
        }
      },
    });
  });
}

// ─── MCP Client Factory ───────────────────────────────────────────────────────
/**
 * Creates a fresh MCP Client connected to the MCP Server via SSE,
 * fetches all registered tools, and converts them to LangChain tools.
 *
 * @returns {Promise<DynamicStructuredTool[]>}
 */
async function getMcpLangChainTools() {
  const client = new Client({ name: 'jarvis-orchestrator', version: '1.0.0' });
  const transport = new SSEClientTransport(new URL(`${MCP_SERVER_URL}/sse`));

  await client.connect(transport);
  console.log('[MCP Bridge] Connected to MCP Server at', MCP_SERVER_URL);

  const toolsResponse = await client.listTools();
  const mcpTools = toolsResponse.tools || [];
  console.log(`[MCP Bridge] Fetched ${mcpTools.length} tools from MCP Server:`, mcpTools.map((t) => t.name));

  const langChainTools = convertMcpToolsToLangChain(mcpTools, client);
  return { client, langChainTools };
}

module.exports = {
  getMcpLangChainTools,
  convertMcpToolsToLangChain,
};
