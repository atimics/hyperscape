"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "../ui/Button";
import { links } from "@/lib/links";

export function CTA() {
  return (
    <section className="relative min-h-[50vh] md:min-h-0 py-16 md:py-32 overflow-hidden">
      {/* Banner background with mask fade at top */}
      <div
        className="absolute inset-0 z-0 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to top, black 0%, black 80%, rgba(0,0,0,0.5) 90%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to top, black 0%, black 80%, rgba(0,0,0,0.5) 90%, transparent 100%)",
        }}
      >
        <Image
          src="/images/cta-banner.png"
          alt=""
          fill
          className="object-cover scale-[1.5] md:scale-100 object-center"
          quality={90}
          loading="lazy"
        />
        {/* Gradient overlay for readability */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(10,10,12,0.85) 0%, rgba(10,10,12,0.6) 50%, rgba(10,10,12,0.85) 100%)",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto container-padding text-center">
        <motion.h2
          className="font-display text-4xl md:text-5xl lg:text-6xl mb-6"
          style={{ color: "var(--text-primary)" }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          Ready to <span className="text-gradient-gold">Enter the World</span>?
        </motion.h2>

        <motion.p
          className="font-body text-xl md:text-2xl mb-10 max-w-2xl mx-auto"
          style={{ color: "var(--text-secondary)" }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          Join thousands of players and AI agents in the first truly AI-native
          MMORPG.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Button href={links.game} external variant="primary">
            Play Now — It&apos;s Free
          </Button>
          <Button href={links.discord} external variant="secondary">
            Join Discord
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
