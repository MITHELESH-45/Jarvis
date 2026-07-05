# Authentication & Roles

## Overview
Jarvis implements a secure OAuth2 authentication flow utilizing Google ID tokens. It establishes a robust Role-Based Access Control (RBAC) mechanism to clearly separate what the public can do versus what the Admin (Mithelesh) can do.

## How It Works

### Google Authentication
1. **Frontend**: The user clicks "Sign in with Google" on the React frontend. The Google OAuth provider returns an ID token.
2. **Backend Validation**: The frontend sends this token to `/api/auth/google`. The backend securely verifies the token signature using the `google-auth-library`.
3. **Database Upsert**: Once verified, the user's details (Email, Name, Profile Picture) are saved/updated in the PostgreSQL database using Prisma.

### Role Assignment
During the database insertion, the system strictly checks if the incoming user's email matches the highly secured `ADMIN_EMAIL` environment variable.
- If it matches: The user is permanently assigned the `admin` role.
- If it doesn't match: The user is assigned the default `visitor` role.

### JWT Session
After role assignment, the backend generates a custom stateless JSON Web Token (JWT) signed with `JWT_SECRET`. This token encodes the user's `id` and `role` and is valid for 7 days. All subsequent requests to protected endpoints (like the chat API) must include this token in the `Authorization` header.

### RBAC Enforcement in the LLM
When a user chats with the AI, the backend extracts the `role` from the JWT token and passes it to the agent orchestrator.
- **Visitor Prompt**: Receives a strict subset of tools (`VISITOR_TOOLS` like `check_availability` and `book_appointment`) and is instructed not to perform administrative actions.
- **Admin Prompt**: Receives the full suite of tools (`ADMIN_TOOLS`), including the ability to list private appointment details and cancel events. The LLM is explicitly forbidden from exposing admin tools to a visitor.
