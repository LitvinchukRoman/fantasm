import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("guides", "routes/guides.tsx"),
  route("ideas", "routes/ideas.tsx"),
  route("ideas/new", "routes/ideas.new.tsx"),
  route("ideas/:slug", "routes/idea.tsx"),
  route("events", "routes/events.tsx"),
  route("notifications", "routes/notifications.tsx"),
  route("settings", "routes/settings.tsx"),
  route("pricing", "routes/pricing.tsx"),
  route("moderation", "routes/moderation.tsx"),
  layout("routes/admin.tsx", [
    route("admin", "routes/admin._index.tsx"),
    route("admin/analytics", "routes/admin.analytics.tsx"),
    route("admin/moderation", "routes/admin.moderation.tsx"),
    route("admin/users", "routes/admin.users.tsx"),
    route("admin/settings", "routes/admin.settings.tsx"),
  ]),
  route("logout", "routes/logout.ts"),
  layout("routes/auth-layout.tsx", [
    route("login", "routes/login.tsx"),
    route("register", "routes/register.tsx"),
    route("welcome", "routes/welcome.tsx"),
  ]),
  route("cookies", "routes/cookies.tsx"),
  route("help", "routes/help.tsx"),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("robots.txt", "routes/robots.ts"),
  route("u/:handle", "routes/profile.tsx"),
  route(":hub", "routes/hub.tsx"),
  route(":hub/:slug", "routes/article.tsx"),
] satisfies RouteConfig;
