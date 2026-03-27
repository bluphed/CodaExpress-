import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";
import Database from "better-sqlite3";

const db = new Database("orders.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    telefono TEXT,
    direccion TEXT,
    distancia REAL,
    costo REAL,
    lat REAL,
    lng REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to resolve short Google Maps links
  app.post("/api/resolve-link", async (req, res) => {
    let { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });
      
      const finalUrl = response.url;
      res.json({ finalUrl });
    } catch (error) {
      console.error("Error resolving link:", error);
      res.status(500).json({ error: "Failed to resolve link" });
    }
  });

  // API to save an order
  app.post("/api/orders", (req, res) => {
    const { nombre, telefono, direccion, distancia, costo, lat, lng } = req.body;
    try {
      const stmt = db.prepare(`
        INSERT INTO orders (nombre, telefono, direccion, distancia, costo, lat, lng)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(nombre, telefono, direccion, distancia, costo, lat, lng);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error saving order:", error);
      res.status(500).json({ error: "Failed to save order" });
    }
  });

  // API to get orders
  app.get("/api/orders", (req, res) => {
    try {
      const orders = db.prepare("SELECT * FROM orders ORDER BY timestamp DESC LIMIT 50").all();
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // API to delete an order
  app.delete("/api/orders/:id", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM orders WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting order:", error);
      res.status(500).json({ error: "Failed to delete order" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
