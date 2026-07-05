const { z } = require("zod");

/**
 * Zod schema defining the strict structured output required from the Router Agent.
 * Ensures the LLM always returns a predictable JSON object for programmatic routing.
 */
const RouterOutputSchema = z.object({
  route: z.enum(["ACTION", "RAG", "HYBRID", "SMALL_TALK", "GENERAL_CHAT"])
    .describe("The selected route based on the user's query intent."),
  confidence: z.number().min(0).max(1)
    .describe("Confidence score of the routing decision, from 0.0 to 1.0."),
  reason: z.string()
    .describe("A concise, internal explanation of why this route was chosen. Do NOT generate natural language for the user here.")
});

module.exports = {
  RouterOutputSchema,
};
