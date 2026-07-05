require("dotenv").config();
const { retrievalPipeline } = require("./src/rag/retrievalPipeline");

async function checkGeneration() {
  console.log("Running pipeline for university query...");
  const response = await retrievalPipeline.execute("What university did Mithelesh attend?");
  console.log("\n--- PIPELINE RESPONSE ---");
  console.log(JSON.stringify(response, null, 2));
}

checkGeneration().then(() => process.exit(0)).catch(e => console.error(e));
