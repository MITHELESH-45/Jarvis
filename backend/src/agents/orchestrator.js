const { ChatOpenAI } = require('@langchain/openai');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, AIMessage, SystemMessage, ToolMessage } = require('@langchain/core/messages');
const { prisma } = require('../db');
const { getMcpLangChainTools } = require('./mcpBridge');

// ─── LLM Factory ─────────────────────────────────────────────────────────────
function createLLM() {
  const openAiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const isValidKey = (key) => key && key.trim() !== '' && !key.startsWith('your_');

  if (isValidKey(openAiKey)) {
    console.log('[Orchestrator] LLM: OpenAI gpt-4o');
    return new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0.3, openAIApiKey: openAiKey });
  }
  if (isValidKey(geminiKey)) {
    // gemini-2.0-flash-lite has the most generous free-tier quota
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';
    console.log(`[Orchestrator] LLM: Google Gemini (${model}) [fallback]`);
    return new ChatGoogleGenerativeAI({ model, temperature: 0.3, apiKey: geminiKey });
  }
  throw new Error('No valid LLM API key found. Set OPENAI_API_KEY or GEMINI_API_KEY in .env.');
}

const VISITOR_TOOLS = ['check_availability', 'book_appointment'];
const ADMIN_TOOLS   = ['check_availability', 'book_appointment', 'block_calendar_time', 'cancel_appointment', 'cancel_appointments_by_date'];

function buildVisitorSystemPrompt(userName, userEmail) {
  return `You are Mithelesh's executive AI assistant and Digital Twin.
- The currently logged-in visitor is: Name: "${userName}", Email: "${userEmail}".
- When booking an appointment, ALWAYS use this name and email automatically — NEVER ask the visitor for their name or email.
- Only ask for: the preferred date/time and the reason/purpose of the meeting.
- All times the user mentions are in IST (Indian Standard Time, UTC+5:30). Always pass times to tools in 24-hour HH:MM:SS format in IST (e.g. "2 PM IST" = "14:00:00").
- Be concise, warm, and professional.
- You cannot block personal calendar time or cancel appointments.
- CRITICAL: The conversation history below is provided only for context. The LAST human message is the ONLY active request you must act on right now. Never repeat or re-execute any action that was already performed in a previous turn.
- Today's date: ${new Date().toISOString().split('T')[0]} (IST)`;
}

function buildAdminSystemPrompt(userName, userEmail) {
  return `You are Mithelesh's personal AI Digital Twin with full administrative access.
- The currently logged-in admin is: Name: "${userName}", Email: "${userEmail}".
- You can check availability, book appointments, block time slots, cancel appointments by date, and cancel individual appointments.
- To cancel all appointments for a specific date, use the cancel_appointments_by_date tool — you do NOT need individual event IDs.
- All times the user mentions are in IST (Indian Standard Time, UTC+5:30). Always pass times to tools in 24-hour HH:MM:SS format in IST (e.g. "2 PM IST" = "14:00:00").
- Be direct and efficient.
- CRITICAL: The conversation history below is provided only for context. The LAST human message is the ONLY active request you must act on right now. Never repeat or re-execute any action that was already performed in a previous turn.
- Today's date: ${new Date().toISOString().split('T')[0]} (IST)`;
}

// ─── Core Handler ─────────────────────────────────────────────────────────────
async function handleChatMessage({ userId, role, message }) {
  // Step 1: Load conversation history and user info
  const [history, currentUser] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      // Only last 3 messages for context — prevents stale actions from old turns
      take: 3,
    }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  history.reverse();

  const userName = currentUser?.name || 'Visitor';
  const userEmail = currentUser?.email || '';

  // Step 2: Get tools from persistent MCP singleton (NO client.close() call)
  let allMcpTools = [];
  try {
    const { langChainTools } = await getMcpLangChainTools();
    allMcpTools = langChainTools;
  } catch (err) {
    console.error('[Orchestrator] Could not connect to MCP Server:', err.message);
    return 'The AI assistant is currently unavailable — the tools server (MCP) is offline. Please try again later.';
  }

  // Step 3: Filter tools by role
  const isAdmin = role === 'admin';
  const allowedNames = isAdmin ? ADMIN_TOOLS : VISITOR_TOOLS;
  const tools = allMcpTools.filter((t) => allowedNames.includes(t.name));
  const systemPrompt = isAdmin
    ? buildAdminSystemPrompt(userName, userEmail)
    : buildVisitorSystemPrompt(userName, userEmail);

  console.log(`[Orchestrator] Role: ${role}. Tools: [${tools.map((t) => t.name).join(', ')}]`);

  // Step 4: Build message history
  const lcMessages = [
    new SystemMessage(systemPrompt),
    ...history.map((msg) =>
      msg.sender === 'user' ? new HumanMessage(msg.message) : new AIMessage(msg.message)
    ),
    new HumanMessage(message),
  ];

  // Step 5: Bind tools to LLM
  const llm = createLLM();
  const llmWithTools = llm.bindTools(tools);

  // Step 6: Agentic loop
  let finalResponse = '';
  const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));
  let currentMessages = [...lcMessages];
  const MAX_ITERATIONS = 10;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const response = await llmWithTools.invoke(currentMessages);
    currentMessages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      finalResponse =
        typeof response.content === 'string'
          ? response.content
          : response.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
      break;
    }

    for (const toolCall of response.tool_calls) {
      const tool = toolMap[toolCall.name];
      const toolResult = tool
        ? await tool.invoke(toolCall.args)
        : `Error: Tool "${toolCall.name}" is not available for your role.`;

      console.log(`[Orchestrator] Tool "${toolCall.name}" result: ${String(toolResult).substring(0, 120)}`);
      currentMessages.push(new ToolMessage(String(toolResult), toolCall.id));
    }
  }

  if (!finalResponse) {
    finalResponse = 'Actions completed. Is there anything else I can help you with?';
  }

  // Step 7: Persist messages — do NOT close MCP client
  await prisma.chatMessage.createMany({
    data: [
      { userId, sender: 'user', message },
      { userId, sender: 'assistant', message: finalResponse },
    ],
  });

  return finalResponse;
}

module.exports = { handleChatMessage };
