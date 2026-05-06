import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/atlas", async (req, res) => {
  const query = req.body.query;

  const prompt = `
Return ONLY valid JSON. No markdown. No explanation.

{
  "title": "",
  "chain": [],
  "nodes": [
    {
      "id": "",
      "label": "",
      "country": "",
      "lat": 0,
      "lng": 0
    }
  ],
  "edges": [],
  "surprise": ""
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
          { role: "system", content: "You are Atlas AI" },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();
    let content = data.choices[0].message.content;

    // 🧠 SAFETY CLEANING (IMPORTANT)
    content = content.replace(/```json/g, "").replace(/```/g, "");

    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.log("❌ JSON PARSE FAILED:", content);
      return res.status(500).json({ error: "Bad AI JSON" });
    }

    res.json(parsed);

  } catch (err) {
    console.log("❌ SERVER ERROR:", err);
    res.status(500).json({ error: "Failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running"));
