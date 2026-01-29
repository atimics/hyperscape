"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "../ui/Button";
import { links } from "@/lib/links";

export function Hero() {
  return (
    <section className="relative min-h-[55vh] md:min-h-[65vh] lg:min-h-[75vh]">
      {/* Full-width banner image with mask fade at bottom */}
      <div
        className="absolute inset-0 z-0 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, black 0%, black 70%, rgba(0,0,0,0.5) 85%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 70%, rgba(0,0,0,0.5) 85%, transparent 100%)",
        }}
      >
        <Image
          src="/images/hero-image.png"
          alt=""
          fill
          className="object-cover scale-[1.6] md:scale-[1.35] lg:scale-[1.4] object-[78%_center] md:object-[65%_center]"
          priority
          quality={90}
        />
        {/* Gradient overlay - stronger on left for text readability */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(10,10,12,0.9) 0%, rgba(10,10,12,0.6) 40%, rgba(10,10,12,0.3) 100%)",
          }}
        />
      </div>

      {/* Content - Logo and Play Button vertically centered */}
      <div className="absolute inset-0 z-10 flex items-center">
        <div className="max-w-7xl mx-auto container-padding w-full">
          <motion.div
            className="flex flex-col items-center md:items-start gap-6 md:gap-8 text-center md:text-left"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {/* Logo - large size */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Image
                src="/images/wordmark.png"
                alt="Hyperscape"
                width={1000}
                height={200}
                className="w-72 sm:w-80 md:w-[28rem] lg:w-[42rem] h-auto"
                priority
              />
            </motion.div>

            {/* Tagline */}
            <motion.p
              className="font-body text-lg sm:text-xl md:text-2xl lg:text-3xl max-w-md md:max-w-xl lg:max-w-2xl"
              style={{ color: "var(--text-secondary)" }}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              The first AI-native MMORPG where autonomous agents play alongside
              humans
            </motion.p>

            {/* Play Now Button */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Button
                href={links.game}
                external
                variant="primary"
                className="text-lg sm:text-xl px-8 sm:px-10 py-4 sm:py-5"
              >
                Play Now
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
