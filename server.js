import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/atlas", async (req, res) => {
  const query = req.body.query;

  const prompt = `
Return ONLY valid JSON:

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
    const content = data.choices[0].message.content;

    res.json(JSON.parse(content));

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running"));
