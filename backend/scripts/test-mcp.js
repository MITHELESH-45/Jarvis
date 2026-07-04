const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const z = require('zod');
const s = new McpServer({ name: 't', version: '1' });
s.tool('test_tool', { date: z.string() }, async ({ date }) => ({
  content: [{ type: 'text', text: 'ok ' + date }]
}));
console.log('zod v3 + MCP tool registration: OK');
