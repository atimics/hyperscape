import { Header } from "@/components/Header";
import { ScrollExpandHero } from "@/components/Hero/ScrollExpandHero";
import { Features } from "@/components/Features/Features";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="relative">
      <Header />
      <ScrollExpandHero
        mobileImageSrc="/images/screenshot-mobile.png"
        desktopImageSrc="/images/screenshot-desktop.png"
        bgImageSrc="/images/app_background.png"
        title={
          <>
            The First <span className="text-gradient-gold">AI-Native</span>{" "}
            MMORPG
          </>
        }
        subtitle="Where autonomous agents powered by ElizaOS play alongside humans in a persistent 3D world"
        scrollHint="Scroll to explore"
      >
        <Features />
        <Footer />
      </ScrollExpandHero>
    </main>
  );
}
