// src/webServer.js
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

export function createWebServer({ port, getState, getEvents, getCars, getTracked, getTracking, setSmart, addCar, removeCar, publicDir }) {
  const app = express();
  const clients = new Set();
  const root = publicDir ?? join(dirname(fileURLToPath(import.meta.url)), "..", "public");
  app.use(express.json());
  app.use(express.static(resolve(root)));

  app.get("/api/state", (_req, res) => res.json(getState()));
  app.get("/api/events", (_req, res) => res.json(getEvents ? getEvents() : []));
  app.get("/api/cars", (_req, res) => res.json(getCars ? getCars() : []));
  app.get("/api/tracked", (_req, res) => res.json(getTracked ? getTracked() : []));
  app.get("/api/tracking", (_req, res) => res.json(getTracking ? getTracking() : { pinned: [], effective: [], smartClass: null, topN: 0 }));
  app.post("/api/tracked", (req, res) => {
    const { add, remove } = req.body || {};
    if (add != null && addCar) return res.json(addCar(add));
    if (remove != null && removeCar) return res.json(removeCar(remove));
    res.status(400).json({ ok: false, error: "add veya remove gerekli" });
  });
  app.post("/api/smart", (req, res) => {
    const { classId, topN } = req.body || {};
    if (setSmart) return res.json(setSmart(classId ?? null, topN ?? 0));
    res.status(400).json({ ok: false });
  });
  app.get("/events", (req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": connected\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });

  let httpServer = null;
  return {
    listen() {
      return new Promise((res) => { httpServer = app.listen(port, "127.0.0.1", () => res({ port: httpServer.address().port })); });
    },
    broadcast(payload) {
      const line = `data: ${JSON.stringify(payload)}\n\n`;
      for (const res of clients) res.write(line);
    },
    close() {
      return new Promise((res) => {
        for (const r of clients) r.end();
        clients.clear();
        if (httpServer) httpServer.close(() => res()); else res();
      });
    },
  };
}
