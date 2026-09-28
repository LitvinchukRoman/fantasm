import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("guides", "routes/guides.tsx"),
  route("ideas", "routes/ideas.tsx"),
  route("ideas/new", "routes/placeholder.tsx", { id: "ideas-new" }),
  route("ideas/:slug", "routes/idea.tsx"),
  route("events", "routes/placeholder.tsx", { id: "events" }),
  layout("routes/auth-layout.tsx", [
    route("login", "routes/login.tsx"),
    route("register", "routes/register.tsx"),
  ]),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("robots.txt", "routes/robots.ts"),
  route(":hub", "routes/hub.tsx"),
  route(":hub/:slug", "routes/article.tsx"),
] satisfies RouteConfig;
