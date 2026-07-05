const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { SystemMessagePromptTemplate, HumanMessagePromptTemplate, ChatPromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { logger } = require("./logger/index.js");
require("dotenv").config();

class QueryRewriter {
  constructor() {
    
    if (process.env.OPENAI_API_KEY) {
      this.llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "gpt-4o",
        temperature: 0.0,
        maxRetries: 2,
      });
    } else {
      this.llm = new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        temperature: 0.0,
        maxRetries: 2,
      });
    }

    const SYSTEM_PROMPT = `You are a search query optimizer for a RAG system.
Your goal is to rewrite the user's input to maximize vector retrieval relevance.

CRITICAL RULES:
1. NEVER change the core intent or meaning of the user's query.
2. Fix spelling and grammar mistakes.
3. Expand known abbreviations (e.g., "JS" -> "JavaScript", "AWS" -> "Amazon Web Services").
4. If the user asks for a resume, portfolio, or projects, keep those exact keywords.
5. DO NOT answer the query. ONLY output the rewritten query.
6. If the query is already clear and properly spelled, output it exactly as is.`;

    this.prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(SYSTEM_PROMPT),
      HumanMessagePromptTemplate.fromTemplate("{query}")
    ]);

    this.chain = this.prompt.pipe(this.llm).pipe(new StringOutputParser());
  }

    async rewrite(rawQuery) {
    const startMs = Date.now();
    try {
      const rewrittenQuery = await this.chain.invoke({ query: rawQuery });
      const latencyMs = Date.now() - startMs;
      
      const cleanRewritten = rewrittenQuery.trim();
      
      if (cleanRewritten.toLowerCase() !== rawQuery.toLowerCase()) {
        logger.info(`[QueryRewriter] Optimized query in ${latencyMs}ms.\n  Original: "${rawQuery}"\n  Rewritten: "${cleanRewritten}"`);
      } else {
        logger.debug(`[QueryRewriter] Query unchanged. (Latency: ${latencyMs}ms)`);
      }
      
      return cleanRewritten;
    } catch (error) {
      logger.error(`[QueryRewriter] Failed to rewrite query: ${error.message}`);
      
      return rawQuery; 
    }
  }
}

const queryRewriter = new QueryRewriter();

module.exports = {
  queryRewriter,
  QueryRewriter
};
