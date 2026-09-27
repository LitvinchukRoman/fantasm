import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

export function PageLoader({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const setReady = () => {
      setTimeout(() => setIsMounted(true), 150);
    };

    if (document.fonts) {
      document.fonts.ready.then(setReady);
    } else {
      setReady();
    }
  }, []);

  return (
    <>
      <AnimatePresence>
        {!isMounted && (
          <motion.div
            key="page-loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--color-bg)]"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
              className="flex items-center justify-center"
            >
              <img src="/favicon.jpg" alt="" className="size-14 rounded-2xl opacity-20 grayscale" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  );
}
