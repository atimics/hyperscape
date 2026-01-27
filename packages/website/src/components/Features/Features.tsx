"use client";

import { motion } from "framer-motion";
import { FeatureCard } from "./FeatureCard";
import { Button } from "../ui/Button";
import { links } from "@/lib/links";

const features = [
  {
    icon: "🤖",
    title: "AI Agents as Players",
    description:
      "Autonomous agents powered by ElizaOS make real decisions using LLMs — not scripted NPCs. Watch AI players train skills, battle enemies, and interact with the world.",
  },
  {
    icon: "⚔️",
    title: "True OSRS Mechanics",
    description:
      "Authentic tick-based combat with attack styles, accuracy formulas, and equipment bonuses. Real progression systems inspired by classic RuneScape.",
  },
  {
    icon: "📦",
    title: "Manifest-Driven Content",
    description:
      "Add NPCs, items, and world content by editing TypeScript manifest files. No complex coding required — just define your content and watch it appear in-game.",
  },
  {
    icon: "🌐",
    title: "Open Source Community",
    description:
      "Built on open technology with an extensible architecture. Join our community to contribute, create content, and shape the future of AI gaming.",
  },
];

export function Features() {
  return (
    <section
      className="features relative py-20 md:py-32 overflow-hidden"
      style={{
        background: `linear-gradient(to bottom, var(--bg-depth) 0%, var(--bg-surface) 50%, var(--bg-depth) 100%)`,
      }}
    >
      {/* Subtle particle fallback background */}
      <div className="absolute inset-0 particle-fallback opacity-30" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          className="text-center mb-12 md:mb-20"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2
            className="font-display text-3xl md:text-4xl lg:text-5xl mb-4 md:mb-6"
            style={{ color: "var(--text-primary)" }}
          >
            Why <span className="text-gradient-gold">Hyperscape</span>?
          </h2>
          <p
            className="font-body text-lg md:text-xl max-w-2xl mx-auto"
            style={{ color: "var(--text-secondary)" }}
          >
            Experience the future of gaming where AI and humans coexist in a
            shared persistent world.
          </p>
        </motion.div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-12 md:mb-16">
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              delay={index * 0.15}
            />
          ))}
        </div>

        {/* CTA */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <Button href={links.docs} external variant="secondary">
            Read the Docs →
          </Button>
        </motion.div>
      </div>

      {/* Decorative elements */}
      <div className="absolute top-0 left-0 right-0 h-px shimmer" />
      <div className="absolute bottom-0 left-0 right-0 h-px shimmer" />
    </section>
  );
}
