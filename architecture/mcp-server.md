# MCP Server (Model Context Protocol)

## Overview
The Jarvis application utilizes the Model Context Protocol (MCP) to decouple tool-execution logic from the main application layer. The MCP Server acts as an independent microservice (running on port 5001) that safely handles all external integrations, specifically Google Calendar and Gmail.

## Components

### 1. Server Definition
The MCP Server defines robust, Zod-validated schemas for a suite of functions. It communicates with the main Express backend via Server-Sent Events (SSE).

### 2. Available Tools
The MCP server exposes multiple tools to the LLM orchestrator:
- `check_availability`: Queries Google Calendar for free slots on a given day (strips private details).
- `book_appointment`: Inserts a new meeting into Google Calendar, stores the record in PostgreSQL, and sends confirmation emails to the visitor and admin via Gmail.
- `list_appointments`: Fetches full, detailed calendar events directly from Google Calendar (restricted to Admin).
- `block_calendar_time`: Books personal time slots as "Busy" (restricted to Admin).
- `cancel_appointment`: Deletes a specific Google Calendar event and notifies the visitor (restricted to Admin).
- `cancel_appointments_by_date`: Bulk-cancels all appointments for a given day (restricted to Admin).

### 3. Execution Flow
1. The main application (Orchestrator) connects to the MCP Server over SSE.
2. The Orchestrator converts the available MCP tools into LangChain-compatible tools.
3. The LLM decides it needs to perform an action and emits a tool-call request.
4. The Orchestrator bridges this request back to the MCP Server.
5. The MCP Server executes the Google Calendar/Gmail logic securely, and returns the result string back over SSE to the LLM.
