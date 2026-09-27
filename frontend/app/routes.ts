import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("guides", "routes/guides.tsx"),
  route("ideas", "routes/ideas.tsx"),
  route("ideas/new", "routes/placeholder.tsx", { id: "ideas-new" }),
  route("ideas/:slug", "routes/idea.tsx"),
  route("events", "routes/placeholder.tsx", { id: "events" }),
  route("login", "routes/placeholder.tsx", { id: "login" }),
  route("sitemap.xml", "routes/sitemap.ts"),
  route(":hub", "routes/hub.tsx"),
  route(":hub/:slug", "routes/article.tsx"),
] satisfies RouteConfig;
