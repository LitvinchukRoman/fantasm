/**
 * Прод-сервер замість react-router-serve. Той роздає build/client через
 * express.static з redirect: true, тож /ideas відповідає 301 на /ideas/ —
 * а canonical, sitemap і всі посилання сайту без кінцевого слеша.
 * Тут /ideas/ редіректить на /ideas: одна адреса на сторінку.
 *
 * Кожну сторінку рендерить SSR. Пререндерені HTML і .data з build/client
 * не віддаються: вони зібрані без сесії, і шапка на них показувала б «Увійти».
 * Пререндер лишається лише для перевірки SEO в CI (scripts/check-seo.mjs).
 */
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

const clientStatic = express.static(CLIENT_DIR, { maxAge: "1h", index: false, redirect: false });
app.use((req, res, next) => {
  const ext = path.extname(req.path);
  if (ext === ".html" || ext === ".data") return next();
  clientStatic(req, res, next);
});
app.use(express.static("public", { maxAge: "1h", index: false, redirect: false }));
app.use(morgan("tiny"));
app.all("*", createRequestHandler({ build, mode: process.env.NODE_ENV }));

const server = app.listen(port, host, () => {
  console.log(`[fantasm] http://${host}:${port}`);
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => server.close(console.error));
}
