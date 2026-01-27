"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

type ScrollExpandHeroProps = {
  mobileImageSrc: string;
  desktopImageSrc: string;
  bgImageSrc: string;
  title?: ReactNode;
  subtitle?: string;
  scrollHint?: string;
  children?: ReactNode;
};

export function ScrollExpandHero({
  mobileImageSrc,
  desktopImageSrc,
  bgImageSrc,
  title,
  subtitle,
  scrollHint = "Scroll to explore",
  children,
}: ScrollExpandHeroProps) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showContent, setShowContent] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [touchStartY, setTouchStartY] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const sectionRef = useRef<HTMLDivElement>(null);

  // Reset state on mount
  useEffect(() => {
    setScrollProgress(0);
    setShowContent(false);
    setIsExpanded(false);
  }, []);

  // Handle scroll/touch events
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (isExpanded && e.deltaY < 0 && window.scrollY <= 5) {
        setIsExpanded(false);
        e.preventDefault();
      } else if (!isExpanded) {
        e.preventDefault();
        const scrollDelta = e.deltaY * 0.0012;
        const newProgress = Math.min(
          Math.max(scrollProgress + scrollDelta, 0),
          1,
        );
        setScrollProgress(newProgress);

        if (newProgress >= 1) {
          setIsExpanded(true);
          setShowContent(true);
        } else if (newProgress < 0.75) {
          setShowContent(false);
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      setTouchStartY(e.touches[0].clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartY) return;

      const touchY = e.touches[0].clientY;
      const deltaY = touchStartY - touchY;

      if (isExpanded && deltaY < -20 && window.scrollY <= 5) {
        setIsExpanded(false);
        e.preventDefault();
      } else if (!isExpanded) {
        e.preventDefault();
        const scrollFactor = deltaY < 0 ? 0.008 : 0.005;
        const scrollDelta = deltaY * scrollFactor;
        const newProgress = Math.min(
          Math.max(scrollProgress + scrollDelta, 0),
          1,
        );
        setScrollProgress(newProgress);

        if (newProgress >= 1) {
          setIsExpanded(true);
          setShowContent(true);
        } else if (newProgress < 0.75) {
          setShowContent(false);
        }

        setTouchStartY(touchY);
      }
    };

    const handleTouchEnd = () => {
      setTouchStartY(0);
    };

    const handleScroll = () => {
      if (!isExpanded) {
        window.scrollTo(0, 0);
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("scroll", handleScroll);
    window.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [scrollProgress, isExpanded, touchStartY]);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Track viewport width for responsive calculations
  const [viewportWidth, setViewportWidth] = useState(1200);

  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  // Calculate dimensions based on scroll progress
  // Mobile starts at phone aspect (9:16), Desktop ends at wide (16:9)
  const mobileWidth = isMobile ? 280 : 320;
  const mobileHeight = isMobile ? 500 : 570;
  const desktopWidth = isMobile
    ? viewportWidth * 0.95
    : Math.min(1400, viewportWidth * 0.9);
  const desktopHeight = isMobile ? 400 : 700;

  const mediaWidth =
    mobileWidth + scrollProgress * (desktopWidth - mobileWidth);
  const mediaHeight =
    mobileHeight + scrollProgress * (desktopHeight - mobileHeight);

  // Crossfade: mobile image fades out, desktop fades in
  // Mobile visible from 0-0.5, Desktop fades in from 0.3-1
  const mobileOpacity = Math.max(0, 1 - scrollProgress * 2);
  const desktopOpacity = Math.min(
    1,
    Math.max(0, (scrollProgress - 0.3) * 1.43),
  );

  // Border radius shrinks as it expands
  const borderRadius = Math.max(8, 24 - scrollProgress * 16);

  // Text animation
  const textTranslateY = scrollProgress * 100;
  const textOpacity = Math.max(0, 1 - scrollProgress * 1.5);

  return (
    <div
      ref={sectionRef}
      className="transition-colors duration-700 ease-in-out overflow-x-hidden"
    >
      <section className="relative flex flex-col items-center justify-start min-h-screen">
        <div className="relative w-full flex flex-col items-center min-h-screen">
          {/* Background image with fade */}
          <motion.div
            className="absolute inset-0 z-0 h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 - scrollProgress * 0.8 }}
            transition={{ duration: 0.1 }}
          >
            <Image
              src={bgImageSrc}
              alt=""
              fill
              className="object-cover"
              priority
              quality={90}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, var(--bg-depth)/60, var(--bg-depth)/40, var(--bg-depth))",
              }}
            />
          </motion.div>

          <div className="container mx-auto flex flex-col items-center justify-start relative z-10">
            <div className="flex flex-col items-center justify-center w-full min-h-screen relative">
              {/* Expanding media container */}
              <div
                className="absolute z-20 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 overflow-hidden"
                style={{
                  width: `${mediaWidth}px`,
                  height: `${mediaHeight}px`,
                  maxWidth: "95vw",
                  maxHeight: "85vh",
                  borderRadius: `${borderRadius}px`,
                  boxShadow: `0 0 60px rgba(0, 0, 0, 0.5), 0 0 ${20 + scrollProgress * 40}px rgba(212, 168, 75, ${0.1 + scrollProgress * 0.2})`,
                }}
              >
                {/* Mobile Screenshot (fades out) */}
                <motion.div
                  className="absolute inset-0"
                  style={{ opacity: mobileOpacity }}
                >
                  <Image
                    src={mobileImageSrc}
                    alt="Mobile gameplay"
                    fill
                    className="object-cover object-center"
                    priority
                  />
                  {/* Dark overlay that fades with scroll */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `rgba(0, 0, 0, ${0.3 - scrollProgress * 0.2})`,
                    }}
                  />
                </motion.div>

                {/* Desktop Screenshot (fades in) */}
                <motion.div
                  className="absolute inset-0"
                  style={{ opacity: desktopOpacity }}
                >
                  <Image
                    src={desktopImageSrc}
                    alt="Desktop gameplay"
                    fill
                    className="object-cover object-center"
                    priority
                  />
                  {/* Subtle overlay */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `rgba(0, 0, 0, ${0.2 - scrollProgress * 0.15})`,
                    }}
                  />
                </motion.div>

                {/* Gold border glow on expansion */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    borderRadius: `${borderRadius}px`,
                    boxShadow: `inset 0 0 0 1px rgba(212, 168, 75, ${scrollProgress * 0.3})`,
                  }}
                />
              </div>

              {/* Title and subtitle (fades out on scroll) */}
              <div
                className="absolute z-10 flex flex-col items-center text-center px-4"
                style={{
                  transform: `translateY(${textTranslateY}px)`,
                  opacity: textOpacity,
                  bottom: isMobile ? "15%" : "12%",
                }}
              >
                {title && (
                  <h1
                    className="font-display text-3xl md:text-5xl lg:text-6xl mb-4"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p
                    className="font-body text-lg md:text-xl max-w-2xl"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {subtitle}
                  </p>
                )}
              </div>

              {/* Scroll hint */}
              {scrollHint && scrollProgress < 0.3 && (
                <motion.div
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 - scrollProgress * 3 }}
                  transition={{ delay: 1, duration: 0.5 }}
                >
                  <span
                    className="text-sm font-body"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {scrollHint}
                  </span>
                  <motion.div
                    className="w-6 h-10 rounded-full flex justify-center pt-2"
                    style={{ border: "2px solid rgba(212, 168, 75, 0.5)" }}
                    animate={{
                      borderColor: [
                        "rgba(212, 168, 75, 0.5)",
                        "rgba(212, 168, 75, 0.8)",
                        "rgba(212, 168, 75, 0.5)",
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <motion.div
                      className="w-1.5 h-3 rounded-full"
                      style={{ background: "var(--gold-essence)" }}
                      animate={{ y: [0, 12, 0] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  </motion.div>
                </motion.div>
              )}
            </div>

            {/* Content that appears after expansion */}
            <motion.section
              className="flex flex-col w-full px-4 py-10 md:px-16 lg:py-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: showContent ? 1 : 0 }}
              transition={{ duration: 0.7 }}
            >
              {children}
            </motion.section>
          </div>
        </div>
      </section>
    </div>
  );
}
