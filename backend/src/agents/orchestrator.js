const { ChatOpenAI } = require('@langchain/openai');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, AIMessage, SystemMessage, ToolMessage } = require('@langchain/core/messages');
const { prisma } = require('../db');
const { getMcpLangChainTools } = require('./mcpBridge');

// ─── LLM Factory: OpenAI first, Gemini as fallback ───────────────────────────
function createLLM() {
  const openAiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const isValidKey = (key) => key && key.trim() !== '' && !key.startsWith('your_');

  if (isValidKey(openAiKey)) {
    console.log('[Orchestrator] LLM Provider: OpenAI (gpt-4o)');
    return new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0.3, openAIApiKey: openAiKey });
  }
  if (isValidKey(geminiKey)) {
    console.log('[Orchestrator] LLM Provider: Google Gemini (gemini-1.5-flash) [fallback]');
    return new ChatGoogleGenerativeAI({ model: 'gemini-1.5-flash', temperature: 0.3, apiKey: geminiKey });
  }
  throw new Error('No valid LLM API key found. Set OPENAI_API_KEY or GEMINI_API_KEY in .env.');
}

// ─── Role-Gated Tool Names ────────────────────────────────────────────────────
const VISITOR_TOOLS = ['check_availability', 'book_appointment'];
const ADMIN_TOOLS   = ['check_availability', 'book_appointment', 'block_calendar_time', 'cancel_appointment'];

// ─── System Prompts ───────────────────────────────────────────────────────────
const VISITOR_SYSTEM_PROMPT = `You are Mithul's executive AI assistant and Digital Twin.
Your sole purpose is to represent Mithul professionally.
- Help visitors check meeting availability and book appointments.
- Always collect a clear reason for the meeting before booking.
- Be concise, warm, and professional in all responses.
- You cannot block personal calendar time or cancel appointments — only admins can do that.
- Today's date for reference: ${new Date().toISOString().split('T')[0]}`;

const ADMIN_SYSTEM_PROMPT = `You are Mithul's personal AI Digital Twin Control Center with full administrative access.
- You can check calendar availability, book appointments, block personal time slots, and cancel appointments.
- When cancelling appointments, always use the correct Google Event ID.
- Be direct and efficient — this is a management interface.
- Today's date for reference: ${new Date().toISOString().split('T')[0]}`;

// ─── Core Handler ─────────────────────────────────────────────────────────────
/**
 * Handles a chat message through the MCP-backed LangChain agentic loop.
 * Dynamically fetches tools from the MCP Server rather than importing them directly.
 *
 * @param {Object} params
 * @param {number} params.userId  - DB ID of the authenticated user.
 * @param {string} params.role    - 'admin' | 'visitor'
 * @param {string} params.message - The incoming user message text.
 * @returns {Promise<string>} - The final AI assistant response.
 */
async function handleChatMessage({ userId, role, message }) {
  // ── Step 1: Load recent conversation history from DB ──────────────────────
  const history = await prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { timestamp: 'desc' },
    take: 10,
  });
  history.reverse(); // Oldest first for correct context order

  // ── Step 2: Fetch all tools from the MCP Server via the bridge ────────────
  let allMcpTools = [];
  let mcpClient = null;
  try {
    const { client, langChainTools } = await getMcpLangChainTools();
    mcpClient = client;
    allMcpTools = langChainTools;
  } catch (err) {
    console.error('[Orchestrator] Could not connect to MCP Server:', err.message);
    return 'The AI assistant is currently unavailable — the tools server (MCP) is not running. Please try again later.';
  }

  // ── Step 3: Filter tools by role ─────────────────────────────────────────
  const isAdmin = role === 'admin';
  const allowedNames = isAdmin ? ADMIN_TOOLS : VISITOR_TOOLS;
  const tools = allMcpTools.filter((t) => allowedNames.includes(t.name));
  const systemPrompt = isAdmin ? ADMIN_SYSTEM_PROMPT : VISITOR_SYSTEM_PROMPT;

  console.log(`[Orchestrator] Role: ${role}. Bound tools: [${tools.map((t) => t.name).join(', ')}]`);

  // ── Step 4: Build LangChain message history ───────────────────────────────
  const lcMessages = [
    new SystemMessage(systemPrompt),
    ...history.map((msg) =>
      msg.sender === 'user' ? new HumanMessage(msg.message) : new AIMessage(msg.message)
    ),
    new HumanMessage(message),
  ];

  // ── Step 5: Initialise LLM and bind the filtered MCP tools ───────────────
  const llm = createLLM();
  const llmWithTools = llm.bindTools(tools);

  // ── Step 6: Agentic tool-calling loop ─────────────────────────────────────
  let finalResponse = '';
  const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));
  let currentMessages = [...lcMessages];
  const MAX_ITERATIONS = 10;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const response = await llmWithTools.invoke(currentMessages);
    currentMessages.push(response);

    // No tool calls — this is the final natural language response
    if (!response.tool_calls || response.tool_calls.length === 0) {
      finalResponse =
        typeof response.content === 'string'
          ? response.content
          : response.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
      break;
    }

    // Execute each requested tool via the MCP bridge
    for (const toolCall of response.tool_calls) {
      const tool = toolMap[toolCall.name];
      const toolResult = tool
        ? await tool.invoke(toolCall.args)
        : `Error: Tool "${toolCall.name}" is not available for your role.`;

      console.log(`[Orchestrator] Tool "${toolCall.name}" → ${toolResult.substring(0, 120)}...`);
      currentMessages.push(new ToolMessage(String(toolResult), toolCall.id));
    }
  }

  if (!finalResponse) {
    finalResponse = 'I have completed the requested actions. Is there anything else I can help you with?';
  }

  // ── Step 7: Persist conversation to DB ────────────────────────────────────
  await prisma.chatMessage.createMany({
    data: [
      { userId, sender: 'user', message },
      { userId, sender: 'assistant', message: finalResponse },
    ],
  });

  // ── Step 8: Close the MCP client connection ───────────────────────────────
  if (mcpClient) {
    try { await mcpClient.close(); } catch (_) {}
  }

  return finalResponse;
}

module.exports = { handleChatMessage };
