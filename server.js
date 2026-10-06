import express from "express";
import cors from "cors";
import { PORTS, PORT_IDS } from "./ports.js";
import { coordsMatchCountry, countryCentre, normCountry } from "./countries.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "20kb" }));

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const CACHE_HOURS = 24;

// ---------------------------------------------------------------------------
// Config and health
// ---------------------------------------------------------------------------

app.get("/config", (req, res) => {
  res.json({ mapboxToken: process.env.MAPBOX_TOKEN });
});

app.get("/", (req, res) => res.send("Atlas API"));

// ---------------------------------------------------------------------------
// Tiny protections: cache repeat searches, limit how fast one device can search.
// ---------------------------------------------------------------------------

const cache = new Map();
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

// ---------------------------------------------------------------------------
// What we ask the AI for. Strict schema: it cannot return anything else.
// ---------------------------------------------------------------------------

const ROLES = ["farm", "mine", "factory", "packhouse", "port_export", "port_import", "hub", "warehouse", "retail"];
const MODES = ["ship", "truck", "air", "rail", "none"];

const schema = {
  name: "atlas_route",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "kind", "confidence", "note", "story", "origin_options", "steps", "surprise"],
    properties: {
      title: { type: "string" },
      kind: { type: "string", enum: ["commodity", "manufactured", "branded", "unclear"] },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      note: { type: "string" },
      story: { type: "string" },
      origin_options: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["country", "detail"],
          properties: { country: { type: "string" }, detail: { type: "string" } },
        },
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["role", "label", "country", "place_id", "lat", "lng", "mode_to_next", "days_to_next", "description"],
          properties: {
            role: { type: "string", enum: ROLES },
            label: { type: "string" },
            country: { type: "string" },
            place_id: { type: "string", enum: [...PORT_IDS, "none"] },
            lat: { type: "number" },
            lng: { type: "number" },
            mode_to_next: { type: "string", enum: MODES },
            days_to_next: { type: "number" },
            description: { type: "string" },
          },
        },
      },
      surprise: { type: "string" },
    },
  },
};

function buildSystemPrompt({ country, city }) {
  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const dest = country
    ? `The consumer is in ${city ? city + ", " : ""}${country}.`
    : "The consumer's country is unknown. Use the most common global route and say so in the note.";

  return `You are the research engine of Atlas, an app that shows where everyday products come from.
Today is ${month}. ${dest}

Trace ONE realistic, typical supply chain for the product, ending in the consumer's country.

HARD RULES
1. One origin only. Pick the single most likely origin country for a consumer in the destination country right now (consider the season). Put the other common origins in origin_options with a short detail (for example the season they supply). Never mix several origins into one chain.
2. Every step before the export port must be in that one origin country. Do not add steps in countries the product does not really pass through.
3. Real places only. For farms, mines, factories and packhouses, name a real region or town (for example "Ica Valley") with accurate coordinates. Never use just a country name as the label.
4. For ports and air hubs, set place_id to an id from the allowed list and use that port's real country. Choose a port that really handles this kind of cargo. For farm, factory, warehouse and retail steps set place_id to "none".
5. The last step must be in the consumer's country: the import port or hub, then optionally a distribution or ripening/packing centre. Do not add a consumer or "you" step. The app adds that.
6. 5 to 8 steps. Each step must be a physically different stage. No filler.
7. mode_to_next and days_to_next describe the leg to the next step. Use realistic transport (refrigerated ship, truck, air freight, rail). Use "none" and 0 on the last step.
8. description: two plain sentences saying what physically happens at this stop and why it matters. No made-up numbers, no company names, no prices.
9. kind: "commodity" for raw foods and materials, "manufactured" for made goods, "branded" if the query names a brand, retailer or specific model, "unclear" if you cannot tell what it is. For branded items trace the typical route for the product category and say in note that the real sourcing of that brand can differ. For "unclear" return confidence "low" and a note asking for a clearer product.
10. confidence: "high" only for well-documented commodity trade. Otherwise "medium" or "low". Be honest.
11. note: one short sentence of honest context (for example that shipments vary by season and supplier). Never claim this is a specific shipment.
12. surprise: one true, well-established fact about this product's journey. If you are not sure of a fact, give a practical fact about how the product is handled instead. No prices.
13. story: two short sentences that sum up the journey in plain words.
14. title: "Where [product] comes from" using the plain product name.

Allowed place_id values: ${PORT_IDS.join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Check what the AI sent. Anything clearly wrong gets rejected or repaired.
// ---------------------------------------------------------------------------

function validate(parsed) {
  const problems = [];   // anything that makes the route unusable
  const soft = [];       // things that look off but are still worth showing
  const steps = parsed.steps || [];

  if (steps.length < 3) problems.push(`Need 5 to 8 steps, got ${steps.length}.`);
  else if (steps.length < 5 || steps.length > 9) soft.push(`Need 5 to 8 steps, got ${steps.length}.`);

  // Single origin: all production-type steps must be in one country.
  const productionCountries = new Set(
    steps.filter((s) => ["farm", "mine", "factory", "packhouse"].includes(s.role)).map((s) => normCountry(s.country))
  );
  if (productionCountries.size > 1 && parsed.kind === "commodity") {
    soft.push(`A commodity must come from one origin country, but steps used: ${[...productionCountries].join(", ")}.`);
  }

  // Port steps must use a port id.
  for (const s of steps) {
    if (["port_export", "port_import"].includes(s.role) && s.place_id === "none") {
      problems.push(`Step "${s.label}" is a port but has no place_id.`);
    }
    if (s.place_id === "none" && !["port_export", "port_import"].includes(s.role)) {
      const ok = coordsMatchCountry(s.country, s.lat, s.lng);
      if (ok === false) soft.push(`"${s.label}" coordinates are not inside ${s.country}.`);
    }
  }

  // No immediate repeats.
  for (let i = 1; i < steps.length; i++) {
    const key = (s) => (s.place_id !== "none" ? s.place_id : s.label.toLowerCase());
    if (key(steps[i]) === key(steps[i - 1])) soft.push(`Duplicate consecutive step "${steps[i].label}".`);
  }
  return { hard: problems, soft };
}

function toResponse(parsed) {
  const nodes = parsed.steps.map((s, i) => {
    const port = PORTS[s.place_id];
    let lat = s.lat, lng = s.lng, label = s.label, country = s.country;
    if (port) {
      lat = port.lat; lng = port.lng; label = port.name; country = port.country;
    } else if (coordsMatchCountry(country, lat, lng) === false) {
      const c = countryCentre(country);
      if (c) { lat = c.lat; lng = c.lng; }
    }
    return {
      id: String(i + 1),
      label,
      country,
      lat,
      lng,
      description: s.description,
      role: s.role,
      modeToNext: s.mode_to_next === "none" ? null : s.mode_to_next,
      daysToNext: s.mode_to_next === "none" ? null : s.days_to_next,
    };
  });

  const edges = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }));
  const totalDays = Math.round(nodes.reduce((sum, n) => sum + (n.daysToNext || 0), 0));

  return {
    title: parsed.title,
    chain: nodes.map((n) => n.label),
    nodes,
    edges,
    surprise: parsed.surprise,
    story: parsed.story,
    kind: parsed.kind,
    confidence: parsed.confidence,
    note: parsed.note,
    alternatives: (parsed.origin_options || []).slice(0, 4),
    totalDays,
  };
}

async function askOpenAI(messages) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages,
      response_format: { type: "json_schema", json_schema: schema },
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.log("OPENAI ERROR:", JSON.stringify(data));
    throw new Error(data?.error?.code || "openai_error");
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("no_content");
  return JSON.parse(content);
}

// ---------------------------------------------------------------------------
// The endpoint
// ---------------------------------------------------------------------------

app.post("/atlas", async (req, res) => {
  const query = String(req.body.query || "").trim().slice(0, 80);
  const country = String(req.body.country || "").trim().slice(0, 60);
  const city = String(req.body.city || "").trim().slice(0, 60);

  if (!query) return res.status(400).json({ error: "Missing query" });
  if (rateLimited(req.ip)) return res.status(429).json({ error: "Too many searches. Try again in a minute." });

  const key = `${query.toLowerCase()}|${country.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_HOURS * 3600_000) {
    console.log("CACHE HIT:", key);
    return res.json(cached.value);
  }

  console.log("QUERY:", query, "| DESTINATION:", country || "unknown");

  try {
    const messages = [
      { role: "system", content: buildSystemPrompt({ country, city }) },
      { role: "user", content: `Product: ${query}` },
    ];

    let parsed = await askOpenAI(messages);
    let check = validate(parsed);

    if (check.hard.length || check.soft.length) {
      const all = [...check.hard, ...check.soft];
      console.log("VALIDATION PROBLEMS, RETRYING:", all);
      messages.push({ role: "assistant", content: JSON.stringify(parsed) });
      messages.push({ role: "user", content: `That route has problems. Fix all of them and return the full route again:\n- ${all.join("\n- ")}` });
      const retry = await askOpenAI(messages);
      const retryCheck = validate(retry);
      // Keep whichever attempt is better.
      if (retryCheck.hard.length <= check.hard.length) { parsed = retry; check = retryCheck; }
    }

    if (check.hard.length) {
      console.log("STILL INVALID:", check.hard);
      return res.status(502).json({ error: "Could not build a reliable route for this product." });
    }

    if (check.soft.length) {
      // Show the route, but be honest that it is less certain.
      console.log("SHOWING WITH WARNINGS:", check.soft);
      parsed.confidence = "low";
      // Drop immediate duplicate steps.
      const key = (s) => (s.place_id !== "none" ? s.place_id : s.label.toLowerCase());
      parsed.steps = parsed.steps.filter((s, i, a) => i === 0 || key(s) !== key(a[i - 1]));
      if (parsed.steps.length < 3) return res.status(502).json({ error: "Could not build a reliable route for this product." });
    }

    const result = toResponse(parsed);
    cache.set(key, { at: Date.now(), value: result });
    res.json(result);
  } catch (err) {
    console.log("❌ SERVER ERROR:", err.message);
    res.status(500).json({ error: "Server failed", reason: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running"));
