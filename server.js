import express from "express";
import cors from "cors";
const app = express();
app.use(cors());
app.use(express.json());

// ✅ Config endpoint for mobile app
app.get("/config", (req, res) => {
  res.json({ mapboxToken: process.env.MAPBOX_TOKEN });
});

app.post("/atlas", async (req, res) => {
  const query = req.body.query;
  console.log("QUERY:", query);
  const prompt = `
You are AtlasAI.
Return strictly valid JSON.
GOAL:
Make the result fascinating, visual, and slightly surprising.
RULES:
- No markdown
- No explanations
- 6 to 9 nodes REQUIRED
- Chain must feel like a story
- Include at least one unexpected step
- Use REAL countries (accurate geography)
- No trailing commas
- All keys must use double quotes
- edges MUST use "from" and "to"
FORMAT:
{
  "title": "Where [thing] comes from",
  "chain": ["step1", "step2", "step3", "step4", "step5"],
  "nodes": [
    {
      "id": "1",
      "label": "Short name",
      "country": "Country",
      "lat": 0.0,
      "lng": 0.0
    }
  ],
  "edges": [
    { "from": "1", "to": "2" }
  ],
  "surprise": "A specific, surprising fact"
}
Query: ${query}
`;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are AtlasAI" },
          { role: "user", content: prompt }
        ],
        temperature: 0.5
      })
    });
    const data = await response.json();
    console.log("OPENAI RAW:", JSON.stringify(data));
    let content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log("❌ No AI content");
      return res.status(500).json({ error: "No AI response" });
    }
    console.log("AI TEXT:", content);
    // 🧠 Clean common AI formatting issues
    content = content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.log("❌ JSON PARSE FAILED:", content);
      return res.status(500).json({
        error: "Invalid JSON from AI",
        raw: content
      });
    }
    // 🧠 Optional safety checks (prevents bad UI crashes)
    if (!parsed.nodes || parsed.nodes.length < 3) {
      console.log("❌ Too few nodes");
      return res.status(500).json({ error: "Not enough data" });
    }
    if (!parsed.edges) {
      parsed.edges = [];
    }
    res.json(parsed);
  } catch (err) {
    console.log("❌ SERVER ERROR:", err);
    res.status(500).json({ error: "Server failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running"));
