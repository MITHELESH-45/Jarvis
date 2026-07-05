# 🤖 Jarvis Digital Twin

An intelligent, production-ready AI Digital Twin that combines **Agentic AI**, **Retrieval-Augmented Generation (RAG)**, and the **Model Context Protocol (MCP)** to provide both knowledge retrieval and real-world task execution.

Unlike traditional chatbots, Jarvis can answer questions about my professional portfolio, execute actions such as scheduling meetings and sending emails, and intelligently route requests through dedicated AI pipelines.

---

## ✨ Features

* 🧠 **Agentic Router** for intelligent intent classification
* 📚 **Advanced RAG Pipeline** powered by Pinecone and Gemini
* ⚡ **Hybrid Retrieval** (Semantic + Keyword Search)
* 🎯 **LLM Re-ranking** for highly relevant responses
* 📅 **Google Calendar Integration**
* 📧 **Gmail Integration**
* 🔐 **Google OAuth Authentication**
* 👥 **Role-Based Access Control (RBAC)**
* 🔧 **Model Context Protocol (MCP)**
* 🚀 **Production-Ready Architecture**

---

# 🏗️ System Architecture

```
                    User
                      │
                      ▼
              Express Backend
                      │
                      ▼
              Agentic Router
              (OpenAI GPT-4o)
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▼
    Retrieval Pipeline      Action Pipeline
      (Gemini RAG)            (MCP Agent)
          │                       │
          ▼                       ▼
      Pinecone DB          Google Services
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
          Google Calendar                Gmail API
```

---

# 🧠 Request Flow

Every incoming request is classified by the **Router Agent** before execution.

### Knowledge Queries

Examples:

* Tell me about your projects.
* Explain Agentic-CX.
* What technologies do you know?

Flow

```
User
   │
   ▼
Router Agent
   │
   ▼
RAG Pipeline
   │
   ▼
Gemini Embeddings
   │
   ▼
Pinecone
   │
   ▼
Gemini Flash
   │
   ▼
Response
```

---

### Action Requests

Examples:

* Book a meeting
* Cancel tomorrow's appointment
* Send an email

Flow

```
User
   │
   ▼
Router Agent
   │
   ▼
Action Pipeline
   │
   ▼
RBAC
   │
   ▼
OpenAI Agent
   │
   ▼
MCP Server
   │
   ▼
Google APIs
```

---

# 🔍 Advanced Retrieval Pipeline

The retrieval system is designed for production-grade accuracy.

Features include:

* Hybrid Search
* Semantic Vector Search
* Dynamic Top-K Retrieval
* Metadata Filtering
* Query Rewriting
* Multi-Query Retrieval
* Context Expansion
* Parent-Child Retrieval
* LLM Re-ranking
* Context Compression
* Citation Tracking

---

# 🔐 Authentication & Authorization

Authentication is powered by **Google OAuth**.

Two user roles are supported:

### Visitor

* Query the knowledge base
* Check calendar availability
* Book appointments

### Admin

* Full calendar access
* View appointments
* Cancel appointments
* Block calendar slots
* Administrative MCP tools

---

# 🛠️ Tech Stack

## Frontend

* React 18
* TypeScript
* Vite
* Tailwind CSS
* Framer Motion
* React Three Fiber
* Three.js

## Backend

* Node.js
* Express.js
* Prisma ORM
* PostgreSQL
* Pinecone
* OpenAI
* Google Gemini
* LangChain
* Model Context Protocol (MCP)

---

# 📁 Project Structure

```
frontend/
backend/
architecture/
├── rag-pipeline.md
├── agentic-router.md
├── mcp-server.md
└── auth-and-roles.md
```

---

# 📖 Architecture Documentation

Detailed documentation for each subsystem is available in the **architecture** directory.

* 📘 RAG Pipeline
* 📗 Agentic Router
* 📙 MCP Server
* 📕 Authentication & RBAC

---

# 🚀 Key Highlights

* Production-grade Agentic AI architecture
* Independent Router, RAG, and Action pipelines
* Advanced Retrieval-Augmented Generation
* Secure Google OAuth authentication
* Real-time Calendar & Gmail integrations
* Modular and scalable backend design
* Enterprise-ready project structure



This project is intended for educational and portfolio purposes.
