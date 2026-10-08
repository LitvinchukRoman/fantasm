import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { motion, type Variants } from "motion/react";
import { getProviders, routeApi } from "~/lib/api.server";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/login";

export const meta: MetaFunction = () =>
  noindexSeo({ title: "Увійти, Fantasm", description: "Вхід до Fantasm, платформи ідей НаУКМА.", path: "/login" });

export async function loader({ request }: Route.LoaderArgs) {
  const { providers } = await routeApi(getProviders(request));
  return { providers, error: new URL(request.url).searchParams.get("error") };
}

export default function LoginRoute({ loaderData }: Route.ComponentProps) {

  const containerVariants: Variants = {
    hidden: { opacity: 1, y: 0, scale: 1 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { 
        duration: 0.6, 
        ease: [0.23, 1, 0.32, 1],
        staggerChildren: 0.08 
      } 
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 1, y: 0 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  };

  return (
    <motion.div variants={containerVariants} initial={false} animate="visible">
          <motion.div variants={itemVariants}>
            <h1 className="text-center text-xl font-semibold text-[var(--color-text)]">
              Увійти до Fantasm
            </h1>
            <p className="mt-2 text-center text-sm text-[var(--color-text-muted)]">
              Оберіть Google або корпоративний Microsoft Entra. Паролів у Fantasm немає.
            </p>
          </motion.div>

          <div className="auth-stage">
          {loaderData.error ? (
            <p role="alert" className="mt-6 rounded-lg border border-red-500/40 p-3 text-sm text-red-300">
              Не вдалося увійти. Спробуйте ще раз.
            </p>
          ) : null}

          <motion.div variants={itemVariants} className="mt-8 space-y-3">
            {loaderData.providers.includes("entra") && <a
              href="/api/auth/entra/login"
              className="flex w-full items-center justify-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-transparent px-4 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
            >
              <MicrosoftIcon />
              Увійти через Microsoft
            </a>}
            {loaderData.providers.includes("google") && <a
              href="/api/auth/google/login"
              className="flex w-full items-center justify-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-transparent px-4 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
            >
              <GoogleIcon />
              Увійти через Google
            </a>}
            {loaderData.providers.length === 0 && <p role="status" className="text-center text-sm text-[var(--color-text-muted)]">Провайдери входу зараз недоступні.</p>}
          </motion.div>

          <motion.div variants={itemVariants} className="auth-reveal mt-8 text-center text-sm text-[var(--color-text-muted)]">
            Немає акаунту?{" "}
            <Link
              to="/register"
              className="inline-block font-medium text-[var(--color-text)] transition-all hover:scale-105 hover:text-[var(--color-accent)]"
            >
              Створити зараз
            </Link>
          </motion.div>
          </div>
    </motion.div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  );
}
