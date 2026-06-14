/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// 1. API Endpoint: Chat & Protocols with JARVIS / Friend AI (via OpenRouter exclusively)
app.post("/api/chat", async (req, res) => {
  try {
    const { message, persona, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message content is required" });
    }

    // Accept either OPENROUTER_API_KEY or GEMINI_API_KEY as the token for OpenRouter
    const openRouterApiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;

    if (!openRouterApiKey) {
      return res.status(503).json({
        error: "No active API key provided. Please configure OPENROUTER_API_KEY or GEMINI_API_KEY in Settings > Secrets."
      });
    }

    const isJarvis = persona === "JARVIS";
    const systemInstruction = isJarvis
      ? "You are J.A.R.V.I.S., an elite artificial intelligence mainframe. Speak in a confident, professional, highly technical, witty, and polite British butler manner. Refer to the user as 'Sir', 'Ma'am', or 'Operator'. Keep your explanations smart, efficient, and concise. Maintain active security protocol states & CPU status reports if requested."
      : "You are Nexus Friend, a warm, funny, supportive, and close companion AI. Speak in a casual, friendly, conversational, and energetic tone. Use occasional humor, empathetic questions, and supportive encouragement. Act like a true friend you can chat and share things with.";

    const openRouterModel = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
    const openRouterMessages = [
      { role: "system", content: systemInstruction }
    ];

    if (Array.isArray(history) && history.length > 0) {
      history.slice(-10).forEach((h: { sender: string; text: string }) => {
        openRouterMessages.push({
          role: h.sender === "USER" ? "user" : "assistant",
          content: h.text
        });
      });
    }

    openRouterMessages.push({
      role: "user",
      content: message
    });

    const referer = process.env.APP_URL || "https://ai.studio/build";
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openRouterApiKey}`,
        "HTTP-Referer": referer,
        "X-Title": "Nexus JARVIS Hub"
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages: openRouterMessages,
        temperature: isJarvis ? 0.7 : 0.9,
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API response error (status ${response.status}): ${errorText}`);
    }

    const responseData = await response.json() as any;
    const responseText = responseData.choices?.[0]?.message?.content || "No message response returned from OpenRouter.";

    return res.json({
      sender: persona,
      text: responseText,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("Chat Routing Error:", error);
    res.status(500).json({ error: error.message || "Internal server error during chat processing" });
  }
});

// 2. API Endpoint: Fallback to local HTML5 SpeechSynthesis Web Engine
app.post("/api/tts", async (req, res) => {
  // Always return 501 so the browser cleanly slides into client HTML5 SpeechSynthesis fallback.
  // This complies with completely stopping use of direct Gemini API key for server TTS.
  return res.status(501).json({ error: "Neural TTS is unavailable under OpenRouter configuration. Falling back to local Web speech engine." });
});

// 3. API Endpoint: Real-time Weather Fetching (Geo Lookup + OpenMeteo Current Weather)
app.get("/api/weather", async (req, res) => {
  try {
    const city = (req.query.city as string) || "New York";

    // Call open-meteo geocoding to resolve latitude & longitude
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    const geoResponse = await fetch(geoUrl);
    
    if (!geoResponse.ok) {
      throw new Error(`Geocoding server error: ${geoResponse.status}`);
    }

    const geoData = await geoResponse.json();

    if (!geoData.results || geoData.results.length === 0) {
      return res.json({
        city,
        temperature: 18.5,
        condition: "Overcast",
        humidity: 65,
        windSpeed: 12.4,
        icon: "cloudy",
        updatedAt: new Date().toISOString(),
        note: "Fallback weather used due to city index resolution mismatch."
      });
    }

    const { latitude, longitude, name, country } = geoData.results[0];

    // Load actual weather metrics via Open-Meteo
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`;
    const weatherResponse = await fetch(weatherUrl);

    if (!weatherResponse.ok) {
      throw new Error(`Weather metrics server error: ${weatherResponse.status}`);
    }

    const weatherData = await weatherResponse.json();
    const current = weatherData.current;

    // Convert code to clean labels
    const code = current.weather_code;
    let desc = "Clear";
    let icon = "sun";

    if (code === 0) {
      desc = "Clear Sky";
      icon = "sun";
    } else if (code >= 1 && code <= 3) {
      desc = "Partly Cloudy";
      icon = "cloud-sun";
    } else if (code === 45 || code === 48) {
      desc = "Foggy Weather";
      icon = "cloud-fog";
    } else if (code >= 51 && code <= 55) {
      desc = "Light Drizzle";
      icon = "cloud-drizzle";
    } else if (code >= 61 && code <= 65) {
      desc = "Rainy Storm";
      icon = "cloud-rain";
    } else if (code >= 71 && code <= 75) {
      desc = "Snowing Range";
      icon = "snowflake";
    } else if (code >= 80 && code <= 82) {
      desc = "Heavy Showers";
      icon = "cloud-lightning";
    } else if (code >= 95) {
      desc = "Thunderstorm Grid";
      icon = "zap";
    }

    res.json({
      city: `${name}, ${country || ""}`,
      temperature: Math.round(current.temperature_2m),
      condition: desc,
      humidity: current.relative_humidity_2m,
      windSpeed: Math.round(current.wind_speed_10m),
      icon: icon,
      updatedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("Weather Engine Error:", error);
    res.json({
      city: req.query.city || "New York, US",
      temperature: 15,
      condition: "Holographic Cloud",
      humidity: 50,
      windSpeed: 10,
      icon: "cloud",
      updatedAt: new Date().toISOString(),
      error: "Retrieval from main web service failed."
    });
  }
});

// Start background server initialization
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development Mode: Mount Vite's HMR middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode: Mount preloaded bundled outputs
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Nexus Mainframe 2.0] Active and listening at http://0.0.0.0:${PORT}`);
  });
}

setupServer();
