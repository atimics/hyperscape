"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

type FeatureCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  delay?: number;
};

export function FeatureCard({
  icon,
  title,
  description,
  delay = 0,
}: FeatureCardProps) {
  return (
    <motion.div
      className="feature-card glass border-gradient-gold rounded-xl p-6 md:p-8 group cursor-default relative"
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      whileHover={{
        y: -8,
        transition: { duration: 0.2 },
      }}
    >
      {/* Icon */}
      <motion.div
        className="w-12 h-12 md:w-14 md:h-14 rounded-lg flex items-center justify-center mb-4 md:mb-6 transition-colors"
        style={{
          background: "var(--glass-highlight)",
        }}
        initial={{ scale: 0.8, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: delay + 0.2, ease: "backOut" }}
      >
        <span className="text-2xl md:text-3xl">{icon}</span>
      </motion.div>

      {/* Title */}
      <h3
        className="font-display text-xl md:text-2xl mb-2 md:mb-3 transition-colors group-hover:text-[var(--gold-essence)]"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h3>

      {/* Description */}
      <p
        className="font-body text-sm md:text-base leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        {description}
      </p>

      {/* Hover glow effect */}
      <motion.div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          boxShadow:
            "0 0 40px rgba(212, 168, 75, 0.2), inset 0 0 0 1px rgba(212, 168, 75, 0.3)",
        }}
      />
    </motion.div>
  );
}
