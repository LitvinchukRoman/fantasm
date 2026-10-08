/**
 * Прод-сервер замість react-router-serve. Той роздає build/client через
 * express.static з redirect: true, тож /ideas відповідає 301 на /ideas/ —
 * а canonical, sitemap і всі посилання сайту без кінцевого слеша.
 * Тут навпаки: /ideas віддає пререндерений ideas/index.html з 200,
 * а /ideas/ редіректить на /ideas. Одна адреса на сторінку.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequestHandler } from "@react-router/express";
import compression from "compression";
import express from "express";
import morgan from "morgan";

const CLIENT_DIR = path.resolve("build/client");
const build = await import(path.resolve("build/server/index.js"));
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";

const app = express();
app.disable("x-powered-by");
// За Caddy запит приходить по http з loopback. Без довіри до X-Forwarded-Proto/Host
// request.url у React Router — http://…, і перевірка Origin в action відповідає 400
// на кожну форму, а API отримує неправильний Origin.
app.set("trust proxy", "loopback");
app.use(compression());

// Stable container health endpoint; never enters React Router or the API client.
app.get("/healthz", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).type("text/plain").send("ok");
});

app.use((req, res, next) => {
  if (req.path.length > 1 && req.path.endsWith("/")) {
    const q = req.originalUrl.indexOf("?");
    const query = q === -1 ? "" : req.originalUrl.slice(q);
    res.redirect(301, req.path.replace(/\/+$/, "") + query);
    return;
  }
  next();
});

app.use(
  "/assets",
  express.static(path.join(CLIENT_DIR, "assets"), { immutable: true, maxAge: "1y", index: false, redirect: false }),
);

// Пререндерені сторінки: /ideas → build/client/ideas/index.html, / → index.html.
// Query (?tag=…) не впливає на файл: фільтри застосовує клієнт.
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (path.extname(req.path)) return next();
  const file = path.join(CLIENT_DIR, req.path, "index.html");
  if (!file.startsWith(CLIENT_DIR + path.sep) || !existsSync(file)) return next();
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.sendFile(file);
});

app.use(express.static(CLIENT_DIR, { maxAge: "1h", index: false, redirect: false }));
app.use(express.static("public", { maxAge: "1h", index: false, redirect: false }));
app.use(morgan("tiny"));
app.all("*", createRequestHandler({ build, mode: process.env.NODE_ENV }));

const server = app.listen(port, host, () => {
  console.log(`[fantasm] http://${host}:${port}`);
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => server.close(console.error));
}
