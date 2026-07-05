require("dotenv").config();
const { retrievalPipeline } = require("./src/rag/retrievalPipeline");

async function checkAchievements() {
  console.log("Running pipeline for achievements...");
  const response = await retrievalPipeline.execute("Tell me about Mithelesh's achievements.");
  console.log("\n--- PIPELINE RESPONSE ---");
  console.log(JSON.stringify(response, null, 2));
}

checkAchievements().then(() => process.exit(0)).catch(e => console.error(e));
