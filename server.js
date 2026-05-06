import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/atlas", async (req, res) => {
  const query = req.body.query;

  // 🔍 Debug: incoming request
  console.log("QUERY:", query);

  const prompt = `
You are AtlasAI.

You MUST return strictly valid JSON.

RULES:
- No markdown
- No explanations
- No text outside JSON
- No trailing commas
- All keys must use double quotes
- Use EXACT structure below
- edges MUST use "from" and "to"
- Do NOT rename fields

FORMAT:

{
  "title": "Where [thing] comes from",
  "chain": ["step1", "step2", "step3"],
  "nodes": [
    {
      "id": "1",
      "label": "Name",
      "country": "Country",
      "lat": 0.0,
      "lng": 0.0
    }
  ],
  "edges": [
    {
      "from": "1",
      "to": "2"
    }
  ],
  "surprise": "One surprising fact"
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
        temperature: 0.4
      })
    });

    const data = await response.json();

    // 🔍 Debug: full OpenAI response
    console.log("OPENAI RAW:", JSON.stringify(data));

    let content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.log("❌ No content returned");
      return res.status(500).json({ error: "No AI response" });
    }

    // 🔍 Debug: raw AI text
    console.log("AI TEXT:", content);

    // 🧠 Clean common AI issues
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

    // ✅ Final response
    res.json(parsed);

  } catch (err) {
    console.log("❌ SERVER ERROR:", err);
    res.status(500).json({ error: "Server failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running"));
