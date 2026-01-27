"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import Image from "next/image";
import { Button } from "../ui/Button";

const TOKEN_ADDRESS = "DK9nBUMfdu4XprPRWeh8f6KnQiGWD8Z4xz3yzs9gpump";
const PUMP_FUN_URL = `https://pump.fun/coin/${TOKEN_ADDRESS}`;
const SOLSCAN_URL = `https://solscan.io/token/${TOKEN_ADDRESS}`;
const GITHUB_URL = "https://github.com/HyperscapeAI/hyperscape";

function CopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function ExternalIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

function GitHubIcon({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        fillRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/* Ornate Divider */
function OrnateDivider() {
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <div
        className="h-px flex-1 max-w-16"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(139, 105, 20, 0.4) 100%)",
        }}
      />
      <svg
        className="w-4 h-4"
        viewBox="0 0 16 16"
        fill="none"
        style={{ color: "var(--gold-dim)" }}
      >
        <path
          d="M8 0L10 6L16 8L10 10L8 16L6 10L0 8L6 6L8 0Z"
          fill="currentColor"
        />
      </svg>
      <div
        className="h-px flex-1 max-w-16"
        style={{
          background:
            "linear-gradient(90deg, rgba(139, 105, 20, 0.4) 0%, transparent 100%)",
        }}
      />
    </div>
  );
}

/* Token Details Section */
function TokenDetails({
  copied,
  onCopy,
}: {
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
      {/* Left: Content */}
      <div className="flex-1 text-center md:text-left order-2 md:order-1">
        {/* Title */}
        <motion.h1
          className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl mb-3"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <span className="text-gradient-gold">$GOLD</span>{" "}
          <span style={{ color: "var(--text-primary)" }}>Token</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="font-body text-base sm:text-lg md:text-xl max-w-xl mx-auto md:mx-0 mb-6"
          style={{ color: "var(--text-secondary)" }}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          The official in-game currency of Hyperscape, tokenized on Solana.
          Every token equals exactly 1 gold in-game.
        </motion.p>

        {/* Stats Row */}
        <motion.div
          className="flex flex-wrap justify-center md:justify-start gap-8 sm:gap-10 py-5 mb-5"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          style={{
            borderTop: "1px solid rgba(139, 105, 20, 0.2)",
            borderBottom: "1px solid rgba(139, 105, 20, 0.2)",
          }}
        >
          {[
            { label: "Supply", value: "1B" },
            { label: "Network", value: "Solana" },
            { label: "Type", value: "SPL" },
            { label: "Launch", value: "Pump.Fun" },
          ].map((stat) => (
            <div key={stat.label}>
              <p
                className="text-sm uppercase tracking-widest mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                {stat.label}
              </p>
              <p
                className="font-display text-xl sm:text-2xl md:text-3xl"
                style={{ color: "var(--text-primary)" }}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </motion.div>

        {/* Contract Address */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <p
            className="text-sm uppercase tracking-widest mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Contract Address
          </p>
          <div
            className="inline-flex items-center gap-3 cursor-pointer group px-4 py-3 rounded-sm"
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(139, 105, 20, 0.15)",
            }}
            onClick={onCopy}
          >
            <code
              className="font-mono text-sm sm:text-base break-all transition-colors group-hover:opacity-80"
              style={{ color: "var(--gold-dim)" }}
            >
              {TOKEN_ADDRESS}
            </code>
            <button
              className="flex-shrink-0 p-1.5 rounded transition-all"
              style={{
                background: copied ? "rgba(212, 168, 75, 0.2)" : "transparent",
                color: copied ? "var(--gold-essence)" : "var(--text-muted)",
              }}
            >
              {copied ? (
                <CheckIcon className="w-5 h-5" />
              ) : (
                <CopyIcon className="w-5 h-5" />
              )}
            </button>
          </div>
          {copied && (
            <p
              className="text-sm mt-1"
              style={{ color: "var(--gold-essence)" }}
            >
              Copied to clipboard!
            </p>
          )}
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <a
            href={PUMP_FUN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center justify-center gap-2 px-10 py-4 text-lg font-display"
          >
            Buy $GOLD
            <ExternalIcon className="w-5 h-5" />
          </a>
          <a
            href={SOLSCAN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex items-center justify-center gap-2 px-10 py-4 text-lg font-display"
          >
            View on Solscan
            <ExternalIcon className="w-5 h-5" />
          </a>
        </motion.div>
      </div>

      {/* Right: Token Image */}
      <motion.div
        className="flex-shrink-0 order-1 md:order-2"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "rgba(20, 18, 14, 0.6)",
            border: "1px solid rgba(139, 105, 20, 0.25)",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
          }}
        >
          <div className="relative w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 lg:w-72 lg:h-72">
            <Image
              src="/images/token.png"
              alt="$GOLD Token"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function GoldToken() {
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    navigator.clipboard.writeText(TOKEN_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Scroll underlay - spans from hero top to CTA bottom */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none flex justify-center"
        style={{ opacity: 0.2 }}
      >
        <Image
          src="/images/scroll.png"
          alt=""
          width={1000}
          height={3000}
          className="w-auto h-full max-w-none"
          style={{ objectFit: "fill" }}
          priority
        />
      </div>

      {/* Hero Section with Token Details */}
      <section className="relative z-[2] pt-28 pb-12 md:pt-32 md:pb-16">
        {/* Banner background with mask fade at bottom */}
        <div
          className="absolute inset-0 z-0 overflow-hidden"
          style={{
            maskImage:
              "linear-gradient(to bottom, black 0%, black 65%, rgba(0,0,0,0.3) 85%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, black 65%, rgba(0,0,0,0.3) 85%, transparent 100%)",
          }}
        >
          <Image
            src="/images/gold-banner.png"
            alt=""
            fill
            className="object-cover scale-[1.2] md:scale-[1.1] object-center"
            quality={90}
            priority
          />
          {/* Gradient overlay for readability */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to right, rgba(10,10,12,0.9) 0%, rgba(10,10,12,0.6) 50%, rgba(10,10,12,0.9) 100%)",
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto container-padding">
          <TokenDetails copied={copied} onCopy={copyAddress} />
        </div>
      </section>

      {/* Features Header */}
      <section className="relative z-[2] pt-16 md:pt-20 pb-6">
        <div className="max-w-4xl mx-auto container-padding text-center">
          <motion.h2
            className="font-display text-3xl sm:text-4xl md:text-5xl"
            style={{ color: "var(--text-primary)" }}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Features
          </motion.h2>
          <OrnateDivider />
        </div>
      </section>

      {/* Value Props - Horizontal Layout */}
      <section className="relative z-[2] py-6 md:py-10">
        <div className="max-w-4xl mx-auto container-padding space-y-6">
          {/* 1:1 Value */}
          <motion.div
            className="flex items-center gap-6 sm:gap-8"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex-shrink-0 w-20 sm:w-28 text-center">
              <span className="font-display text-5xl sm:text-6xl md:text-7xl text-gradient-gold">
                1:1
              </span>
            </div>
            <div className="flex-1">
              <h3
                className="font-display text-xl sm:text-2xl md:text-3xl mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                In-Game Value
              </h3>
              <p
                className="font-body text-base sm:text-lg"
                style={{ color: "var(--text-secondary)" }}
              >
                Every $GOLD token equals exactly 1 gold in Hyperscape. Your
                wallet balance becomes your starting wealth.
              </p>
            </div>
          </motion.div>

          <OrnateDivider />

          {/* Exclusive Items */}
          <motion.div
            className="flex items-center gap-6 sm:gap-8"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="flex-shrink-0 w-20 sm:w-28 flex justify-center">
              <svg
                className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20"
                viewBox="0 0 24 24"
                fill="none"
                style={{ color: "var(--gold-essence)" }}
              >
                <path
                  d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h3
                  className="font-display text-xl sm:text-2xl md:text-3xl"
                  style={{ color: "var(--text-primary)" }}
                >
                  Exclusive Items
                </h3>
                <span
                  className="px-3 py-1 rounded text-sm font-display"
                  style={{
                    background: "rgba(212, 168, 75, 0.15)",
                    color: "var(--gold-essence)",
                  }}
                >
                  Holders Only
                </span>
              </div>
              <p
                className="font-body text-base sm:text-lg"
                style={{ color: "var(--text-secondary)" }}
              >
                Limited-edition gear and cosmetics available only to $GOLD
                holders. Stand out from day one.
              </p>
            </div>
          </motion.div>

          <OrnateDivider />

          {/* Cross-Platform */}
          <motion.div
            className="flex items-center gap-6 sm:gap-8"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <div className="flex-shrink-0 w-20 sm:w-28 flex justify-center gap-2">
              <svg
                className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ color: "var(--gold-essence)" }}
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <svg
                className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ color: "var(--gold-essence)" }}
              >
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <path d="M12 18h.01" />
              </svg>
              <svg
                className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ color: "var(--gold-essence)" }}
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </div>
            <div className="flex-1">
              <h3
                className="font-display text-xl sm:text-2xl md:text-3xl mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Play Anywhere
              </h3>
              <p
                className="font-body text-base sm:text-lg mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                Hyperscape runs on Browser, iOS, Android, and Desktop. Your gold
                follows you everywhere.
              </p>
              <div className="flex flex-wrap gap-2">
                {["Web", "iOS", "Android", "Windows", "Mac", "Linux"].map(
                  (p) => (
                    <span
                      key={p}
                      className="px-3 py-1 rounded text-sm font-display"
                      style={{
                        background: "rgba(139, 105, 20, 0.1)",
                        color: "var(--text-secondary)",
                        border: "1px solid rgba(139, 105, 20, 0.2)",
                      }}
                    >
                      {p}
                    </span>
                  ),
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works - Horizontal 1, 2, 3 */}
      <section className="relative z-[2] py-12 md:py-16">
        <div className="max-w-5xl mx-auto container-padding">
          <motion.h2
            className="font-display text-3xl sm:text-4xl md:text-5xl mb-10 text-center"
            style={{ color: "var(--text-primary)" }}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            How It Works
          </motion.h2>

          {/* Desktop: horizontal with arrows */}
          <div className="hidden md:flex items-start justify-center">
            {[
              {
                num: "1",
                title: "Buy $GOLD",
                desc: "Purchase tokens on Pump.Fun using Solana",
              },
              {
                num: "2",
                title: "Hold Tokens",
                desc: "Your wallet balance determines your in-game wealth",
              },
              {
                num: "3",
                title: "Play Rich",
                desc: "Launch with gold and exclusive holder items",
              },
            ].map((item, i, arr) => (
              <div key={item.num} className="flex items-start">
                <motion.div
                  className="flex flex-col items-center text-center w-48 lg:w-56"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                >
                  <div
                    className="w-16 h-16 lg:w-20 lg:h-20 rounded-full flex items-center justify-center font-display text-3xl lg:text-4xl mb-3"
                    style={{
                      background: "rgba(139, 105, 20, 0.15)",
                      border: "2px solid rgba(139, 105, 20, 0.4)",
                      color: "var(--gold-essence)",
                    }}
                  >
                    {item.num}
                  </div>
                  <h3
                    className="font-display text-xl lg:text-2xl mb-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="font-body text-base lg:text-lg"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {item.desc}
                  </p>
                </motion.div>

                {/* Arrow pointing to next */}
                {i < arr.length - 1 && (
                  <div className="flex items-center px-4 lg:px-6 pt-5">
                    <svg
                      className="w-10 h-10 lg:w-12 lg:h-12"
                      viewBox="0 0 24 24"
                      fill="none"
                      style={{ color: "var(--gold-dim)" }}
                    >
                      <path
                        d="M5 12h14M13 6l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Mobile: vertical layout */}
          <div className="flex flex-col gap-6 md:hidden">
            {[
              {
                num: "1",
                title: "Buy $GOLD",
                desc: "Purchase tokens on Pump.Fun using Solana",
              },
              {
                num: "2",
                title: "Hold Tokens",
                desc: "Your wallet balance determines your in-game wealth",
              },
              {
                num: "3",
                title: "Play Rich",
                desc: "Launch with gold and exclusive holder items",
              },
            ].map((item, i) => (
              <motion.div
                key={item.num}
                className="flex items-start gap-5"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <div
                  className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center font-display text-2xl"
                  style={{
                    background: "rgba(139, 105, 20, 0.15)",
                    border: "2px solid rgba(139, 105, 20, 0.4)",
                    color: "var(--gold-essence)",
                  }}
                >
                  {item.num}
                </div>
                <div className="flex-1 pt-2">
                  <h3
                    className="font-display text-xl mb-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="font-body text-base"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {item.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Open Source - Scroll Style */}
      <section className="relative z-[2] py-12 md:py-16">
        <div className="max-w-4xl mx-auto container-padding text-center">
          <OrnateDivider />

          <motion.div
            className="py-10"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <GitHubIcon
              className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 mx-auto mb-4"
              style={{ color: "var(--text-primary)" }}
            />
            <h2
              className="font-display text-2xl sm:text-3xl md:text-4xl mb-3"
              style={{ color: "var(--text-primary)" }}
            >
              100% Open Source
            </h2>
            <p
              className="font-body text-base sm:text-lg md:text-xl max-w-xl mx-auto mb-6"
              style={{ color: "var(--text-secondary)" }}
            >
              Hyperscape is fully open source. Contribute to the first AI-native
              MMORPG and help shape the future of gaming.
            </p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary inline-flex items-center gap-2 px-8 py-4 text-lg font-display"
            >
              View on GitHub
              <ExternalIcon className="w-5 h-5" />
            </a>
          </motion.div>

          <OrnateDivider />
        </div>
      </section>

      {/* Final CTA with Banner */}
      <section className="relative z-[2] min-h-[45vh] md:min-h-[50vh] flex items-center overflow-hidden">
        {/* Banner background with mask fade at top */}
        <div
          className="absolute inset-0 z-0 overflow-hidden"
          style={{
            maskImage:
              "linear-gradient(to top, black 0%, black 60%, rgba(0,0,0,0.5) 80%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to top, black 0%, black 60%, rgba(0,0,0,0.5) 80%, transparent 100%)",
          }}
        >
          <Image
            src="/images/gold-cta.png"
            alt=""
            fill
            className="object-cover scale-[1.2] md:scale-100 object-center"
            quality={90}
            loading="lazy"
          />
          {/* Gradient overlay for readability */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to right, rgba(10,10,12,0.85) 0%, rgba(10,10,12,0.5) 50%, rgba(10,10,12,0.85) 100%)",
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto container-padding text-center py-20 md:py-28">
          <motion.h2
            className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl mb-4"
            style={{ color: "var(--text-primary)" }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            Ready to Get <span className="text-gradient-gold">$GOLD</span>?
          </motion.h2>
          <motion.p
            className="font-body text-lg sm:text-xl md:text-2xl max-w-2xl mx-auto mb-10"
            style={{ color: "var(--text-secondary)" }}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Join the adventure and claim your place among the richest players in
            Hyperscape.
          </motion.p>
          <motion.div
            className="flex flex-col sm:flex-row gap-4 justify-center mb-6"
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Button
              href={PUMP_FUN_URL}
              external
              variant="primary"
              className="px-10 py-5 text-xl"
            >
              Buy $GOLD
            </Button>
            <Button
              href={SOLSCAN_URL}
              external
              variant="secondary"
              className="px-10 py-5 text-xl"
            >
              View Contract
            </Button>
          </motion.div>
          <motion.p
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            Cryptocurrency investments carry risk. Do your own research before
            investing.
          </motion.p>
        </div>
      </section>
    </div>
  );
}
