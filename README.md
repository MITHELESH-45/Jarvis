# Jarvis Digital Twin - Advanced Agentic Architecture

Welcome to the **Jarvis Digital Twin**, an autonomous, highly-intelligent portfolio assistant. This application goes beyond standard chatbots by utilizing an **Agentic Router**, **Retrieval-Augmented Generation (RAG)**, and the **Model Context Protocol (MCP)** to interact dynamically with the real world (e.g., managing a live Google Calendar and sending Gmails).

---

## 🛠️ Tech Stack & Technologies

### Frontend
- **Framework**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS (Dynamic, Glassmorphism, Responsive)
- **3D Graphics & Animations**: Three.js, React Three Fiber, Framer Motion
- **State Management**: Context API (AuthContext, ThemeContext)

### Backend
- **Core**: Node.js, Express.js
- **Database**: PostgreSQL (managed via Prisma ORM)
- **Vector Database**: Pinecone (for semantic/keyword RAG retrieval)
- **AI Models**: OpenAI (`gpt-4o`), Google Gemini (`gemini-2.0-flash-lite`, `text-embedding-004`)
- **Integration Layer**: Model Context Protocol (MCP SDK), Server-Sent Events (SSE)
- **APIs**: Google Calendar API, Gmail API, Google OAuth2

---

## 🧠 Comprehensive Architecture & Workflow Diagram

The following diagram maps the exact lifecycle of a query from the moment the user hits "Send", detailing every agent, security check, and pipeline the data flows through.

```mermaid
flowchart TD
    %% -----------------------------------------
    %% 1. Client Layer
    %% -----------------------------------------
    subgraph Client [Frontend / User Interface]
        UI[Chat UI]
        AuthUI[Google OAuth Login]
        UI -- "JWT + Message" --> API
    end

    AuthUI -- "Google ID Token" --> AuthRoute

    %% -----------------------------------------
    %% 2. API & Security Layer
    %% -----------------------------------------
    subgraph Express [Express Backend :5000]
        AuthRoute[POST /api/auth/google]
        AuthMid[Auth Middleware]
        API[POST /api/chat]

        AuthRoute -- "Validate Token & Check if ADMIN_EMAIL" --> DB[(PostgreSQL)]
        DB -- "Return Role (Admin/Visitor)" --> AuthRoute
        AuthRoute -- "Issue Custom JWT" --> Client

        API --> AuthMid
        AuthMid -- "Extract Role & UserId" --> ChatService[Chat Service]
    end

    %% -----------------------------------------
    %% 3. Agentic Routing Layer
    %% -----------------------------------------
    subgraph Routing [Agentic Routing System]
        ChatService --> RouterAgent{Router Agent (LLM)}
        RouterAgent -- "Analyzes Intent" --> RouterDecision{Decision Node}
    end

    %% -----------------------------------------
    %% 4. Execution Pipelines
    %% -----------------------------------------
    RouterDecision -- "Intent: RAG / Knowledge" --> RAGPipeline[Retrieval Pipeline]
    RouterDecision -- "Intent: ACTION / Scheduling" --> Orchestrator[Agent Orchestrator]
    RouterDecision -- "Intent: SMALL_TALK" --> RAGPipeline

    %% -- RAG Subsystem --
    subgraph RAG [RAG System]
        RAGPipeline --> QueryRewriter[Query Rewriter]
        QueryRewriter --> HybridRetriever[Hybrid Retriever]
        HybridRetriever <--> Pinecone[(Pinecone Vector DB)]
        HybridRetriever --> Reranker[Relevance Reranker]
        Reranker --> PromptBuilder[Prompt Builder]
        PromptBuilder --> Generator[Gemini / GPT-4o]
    end

    %% -- Action Subsystem --
    subgraph Action [Action Pipeline]
        Orchestrator --> RBAC{RBAC Check}
        RBAC -- "Role: Visitor" --> VTools[Visitor Tools Allowed]
        RBAC -- "Role: Admin" --> ATools[All Admin Tools Allowed]
        
        VTools --> LLM[LLM Engine]
        ATools --> LLM
        
        LLM -- "Decides to invoke tool" --> MCPBridge[MCP Bridge]
    end

    %% -----------------------------------------
    %% 5. MCP Microservice Layer
    %% -----------------------------------------
    subgraph MCPServer [MCP SSE Server :5001]
        MCPBridge <-->|SSE Stream| MCPNode[MCP Server Node]
        
        MCPNode -- "check_availability" --> GC[Google Calendar API]
        MCPNode -- "book_appointment" --> GC
        MCPNode -- "list_appointments (Admin)" --> GC
        MCPNode -- "cancel_appointment (Admin)" --> GC
        
        MCPNode -- "Send Confirm/Cancel Emails" --> Gmail[Gmail API]
    end

    %% Return Paths
    Generator -. "Returns Text" .-> API
    MCPNode -. "Returns Tool Result" .-> LLM
    LLM -. "Final Response" .-> API
    API -. "Streams to UI" .-> UI
```

---

## 🔍 The Query Lifecycle: How It Actually Works

When a user types a message in the chat interface, the system initiates a highly complex, multi-agent workflow. Here is the step-by-step breakdown:

### 1. Authentication & Role Assignment
When a user logs in via Google, the backend compares their email against the highly restricted `ADMIN_EMAIL`. 
- **Mithelesh (Admin)** receives a JWT embedded with `role: admin`.
- **Everyone Else (Visitor)** receives a JWT with `role: visitor`.

### 2. The Agentic Router (Traffic Controller)
When the message hits `/api/chat`, it doesn't go straight to a massive, slow LLM. First, it hits the **Router Agent**. The Router Agent uses structured LLM outputs to instantly classify the intent of the message:
- If the user asks, *"What projects did Mithelesh build?"* → Routed to **RAG Pipeline**.
- If the user asks, *"Can I book a meeting?"* or *"Cancel my 2 PM meeting"* → Routed to **Action Pipeline**.

### 3. The RAG Flow (Knowledge Retrieval)
If routed to RAG, the system must answer truthfully based on Mithelesh's portfolio:
1. **Query Rewriter**: Reformulates the user's messy query into an optimized search string.
2. **Hybrid Retriever**: Queries the **Pinecone Vector DB**. It uses semantic search (vector proximity) and BM25 keyword search simultaneously to find the most relevant chunks of Mithelesh's resume and project docs.
3. **Reranker**: Discards irrelevant chunks.
4. **Generator**: A final LLM reads the strictly retrieved context and formulates a human-like response. Hallucinations are mathematically eliminated because the LLM is restricted to the retrieved context.

### 4. The Action Flow (Real-World Interaction)
If routed to Action, the **Agent Orchestrator** takes over. This is where the application interacts with the real world (Google Calendar & Gmail). 

The Orchestrator strictly enforces **Role-Based Access Control (RBAC)**:

#### 🧑‍💻 The Visitor Experience
When a regular visitor interacts with the Action Pipeline:
- The Orchestrator limits the AI to only `VISITOR_TOOLS` (e.g., `check_availability`, `book_appointment`).
- If the visitor asks to see the schedule, the MCP Server strips out all private names and meeting purposes, returning only "Busy" time slots to the AI.
- The visitor can book a time slot, which safely inserts an event into Google Calendar and fires an email via Gmail, but the visitor **cannot** read other people's meetings or cancel them.

#### 👑 The Admin Experience (Mithelesh)
When Mithelesh interacts with the Action Pipeline:
- The Orchestrator grants the AI access to `ADMIN_TOOLS` (e.g., `list_appointments`, `cancel_appointment`, `block_calendar_time`).
- If Mithelesh asks, *"List my appointments for tomorrow"*, the AI knows to bypass the restricted visitor tools and uses the powerful `list_appointments` tool.
- The MCP Server fetches the **full, unredacted data** directly from the Google Calendar API (including Visitor Emails, Names, and Reasons) and feeds it to the AI.
- Mithelesh can then command the AI to *"Cancel my 2 PM appointment"*, and the agent will autonomously execute the `cancel_appointment` tool, delete the Google Calendar event, remove it from PostgreSQL, and send an apology email via Gmail to the visitor.

---

## 📂 Internal Architecture Documentation

For a technical deep-dive into the codebase and exact file structures for each subsystem, please see the individual documentation files located in the `/architecture` folder:

- 📘 [RAG Pipeline Architecture](./architecture/rag-pipeline.md)
- 📗 [Agentic Router Architecture](./architecture/agentic-router.md)
- 📙 [Model Context Protocol (MCP) Architecture](./architecture/mcp-server.md)
- 📕 [Authentication & Role-Based Access Control](./architecture/auth-and-roles.md)
