require("dotenv").config();
const { Pinecone } = require("@pinecone-database/pinecone");
const { queryEmbedder } = require("./src/rag/embedQuery");

async function checkPinecone() {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pc.index(process.env.PINECONE_INDEX_NAME);

  console.log("Embedding query...");
  const vector = await queryEmbedder.embed("What university did Mithelesh attend?");

  console.log("Querying Pinecone...");
  const results = await index.query({
    vector,
    topK: 3,
    includeMetadata: true
  });

  console.log("\n--- RAW CHUNKS IN PINECONE ---");
  results.matches.forEach((match, i) => {
    console.log(`\nMatch ${i + 1} (Score: ${match.score}):`);
    console.log(`ID: ${match.id}`);
    console.log(`TEXT: ${match.metadata.text}`);
  });
}

checkPinecone().then(() => process.exit(0)).catch(e => console.error(e));
