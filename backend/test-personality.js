require("dotenv").config();
const { retrievalPipeline } = require("./src/rag/retrievalPipeline");

async function checkPersonality() {
  console.log("Running pipeline for a broad query to test personality...");
  const response = await retrievalPipeline.execute("Can you share your resume link and tell me about your projects?");
  console.log("\n--- PIPELINE RESPONSE ---");
  console.log(JSON.stringify(response, null, 2));
}

checkPersonality().then(() => process.exit(0)).catch(e => console.error(e));
