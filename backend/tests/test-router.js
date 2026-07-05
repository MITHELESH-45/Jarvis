require("dotenv").config();
const { RouterAgent } = require("./src/router/routerAgent");

async function testRouter() {
  const router = new RouterAgent();
  
  const queries = [
    "I'm sorry, but I don't have access to Mithelesh's resume link.",
    "Tell me about Mithelesh's achievements.",
    "Share your resume link",
    "tell me about your projects",
    "What university did you attend?"
  ];

  for (const q of queries) {
    console.log(`\nTesting Query: "${q}"`);
    const decision = await router.route(q);
    console.log(`Route: ${decision.route} (Confidence: ${decision.confidence})`);
    console.log(`Reason: ${decision.reason}`);
  }
}

testRouter().then(() => process.exit(0)).catch(e => console.error(e));
