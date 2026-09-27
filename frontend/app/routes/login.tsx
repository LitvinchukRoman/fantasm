import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { useState } from "react";
import { motion, type Variants } from "motion/react";
import { IconArrowRight } from "../components/landing/icons";

export const meta: MetaFunction = () => {
  return [{ title: "Увійти | Fantasm" }];
};

export default function LoginRoute() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }
    // Proceed with login
  };

  const containerVariants: Variants = {
    hidden: { opacity: 1, y: 30, scale: 0.98 },
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
    shake: { 
      opacity: 1, 
      y: 0, 
      scale: 1, 
      x: [-10, 10, -10, 10, -5, 5, 0], 
      transition: { duration: 0.4 } 
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
    shake: { opacity: 1, y: 0 }
  };

  return (
    <motion.div variants={containerVariants} initial={false} animate={isShaking ? "shake" : "visible"}>
          <motion.div variants={itemVariants}>
            <h1 className="text-center text-xl font-semibold text-[var(--color-text)]">
              З поверненням
            </h1>
            <p className="mt-2 text-center text-sm text-[var(--color-text-muted)]">
              Увійдіть через корпоративну пошту, щоб отримати повний доступ.
            </p>
          </motion.div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <motion.div variants={itemVariants}>
              <label className="block text-sm font-medium text-[var(--color-text)]">
                Електронна пошта
              </label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@ukma.edu.ua"
                className={`mt-1.5 block w-full rounded-[var(--radius-control)] border ${
                  isShaking && !email ? "border-red-500" : "border-[var(--color-border)]"
                } bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-all duration-500 hover:border-[var(--color-accent)] hover:shadow-[0_0_12px_rgba(255,0,0,0.3)] input-focus-pulse`}
              />
            </motion.div>

            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-[var(--color-text)]">
                  Пароль
                </label>
                <Link
                  to="#"
                  className="inline-block text-xs font-medium text-[var(--color-accent)] transition-all hover:scale-105 hover:text-[var(--color-accent-strong)]"
                >
                  Забули пароль?
                </Link>
              </div>
              <div className="relative mt-1.5">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`block w-full rounded-[var(--radius-control)] border ${
                    isShaking && !password ? "border-red-500" : "border-[var(--color-border)]"
                  } bg-[var(--color-bg)] pl-3 pr-10 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-all duration-500 hover:border-[var(--color-accent)] hover:shadow-[0_0_12px_rgba(255,0,0,0.3)] input-focus-pulse`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] transition-all hover:scale-110 hover:text-[var(--color-accent)]"
                  aria-label={showPassword ? "Приховати пароль" : "Показати пароль"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </motion.div>

            <motion.div variants={itemVariants}>
              <button
                type="submit"
                className="btn-shimmer mt-2 flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-bg)] transition-all hover:bg-[var(--color-accent-strong)] hover:scale-[1.02] active:scale-[0.98]"
              >
                Увійти
                <IconArrowRight className="size-4" />
              </button>
            </motion.div>
          </form>

          <motion.div variants={itemVariants} className="my-6 flex items-center gap-3 text-[var(--color-text-faint)]">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            <span className="text-xs font-medium uppercase tracking-wider">
              або
            </span>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </motion.div>

          <motion.div variants={itemVariants} className="space-y-3">
            <button
              type="button"
              className="flex w-full items-center justify-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-transparent px-4 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
            >
              <MicrosoftIcon />
              Увійти через Microsoft
            </button>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-transparent px-4 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
            >
              <GoogleIcon />
              Увійти через Google
            </button>
          </motion.div>

          <motion.div variants={itemVariants} className="mt-8 text-center text-sm text-[var(--color-text-muted)]">
            Немає акаунту?{" "}
            <Link
              to="/register"
              className="inline-block font-medium text-[var(--color-text)] transition-all hover:scale-105 hover:text-[var(--color-accent)]"
            >
              Створити зараз
            </Link>
          </motion.div>
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

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
