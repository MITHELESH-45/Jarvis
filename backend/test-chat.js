require("dotenv").config();
const { chatService } = require("./src/services/chat.service");
const { logger } = require("./src/rag/logger/index");

async function runTests() {
  logger.info("=========================================");
  logger.info("   JARVIS DIGITAL TWIN - SYSTEM TEST");
  logger.info("=========================================\n");

  const testQueries = [
    {
      type: "ACTION",
      query: "Schedule a 30-minute meeting with John for tomorrow at 2 PM."
    },
    {
      type: "RAG (Simple)",
      query: "What university did Mithelesh attend?"
    },
    {
      type: "RAG (Complex)",
      query: "Explain the architecture of the caching layer he implemented in the portfolio project."
    }
  ];

  for (const test of testQueries) {
    logger.info(`\n\n--- TESTING ROUTE: ${test.type} ---`);
    logger.info(`QUERY: "${test.query}"`);
    
    try {
      const response = await chatService.processQuery(test.query);
      
      console.log("\n[FINAL SYSTEM RESPONSE]");
      console.log(JSON.stringify(response, null, 2));
      
    } catch (error) {
      logger.error(`Test failed: ${error.message}`);
    }
    
    // Slight delay between tests to respect any free-tier rate limits
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  logger.info("\n\n=== TESTS COMPLETE ===");
}

// Execute
runTests().then(() => process.exit(0)).catch(() => process.exit(1));
