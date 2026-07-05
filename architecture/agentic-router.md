# Agentic Router

## Overview
The Router Agent acts as the intelligent traffic controller of the Jarvis application. Rather than using a monolithic LLM call for all queries, the Router analyzes the user's intent and dynamically delegates the query to the most appropriate subsystem.

## How It Works

### Intent Classification
When a user sends a message to the `/api/chat` endpoint, the `chat.service.js` immediately passes the raw text to the `RouterAgent`. 
The `RouterAgent` leverages a fast, lightweight LLM call to classify the query into one of several predefined routes:
- **ACTION**: Queries that require executing a real-world task (e.g., booking a meeting, checking calendar availability, canceling an appointment).
- **RAG**: Queries asking for information about Mithelesh's past projects, skills, or portfolio.
- **SMALL_TALK**: Casual conversation, greetings, and pleasantries.
- **GENERAL_CHAT**: Questions that don't fit into the domain of the portfolio but require conversational logic.

### Delegation Logic
Once the route is identified, `chat.service.js` delegates the flow:
1. If the route is **ACTION**, it invokes the `handleChatMessage` orchestrator. This orchestrator triggers the agentic loop, binding the LLM to the MCP tools (Model Context Protocol), allowing the AI to read/write from Google Calendar.
2. If the route is **RAG** (or fallback), it routes the query to the `RetrievalPipeline`, which queries the Pinecone vector database to answer the question using specific portfolio context.

### Advantages
- **Cost & Speed**: Simple questions can be routed to cheaper/faster LLMs, while complex tool-calling is reserved for advanced models (like GPT-4o).
- **Tool Segregation**: The RAG pipeline doesn't need to know about Google Calendar tools, reducing prompt pollution and preventing hallucinations where the AI tries to use tools incorrectly.
