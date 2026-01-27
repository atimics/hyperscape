import { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { GoldToken } from "@/components/GoldToken/GoldToken";
import { Background } from "@/components/Background";

export const metadata: Metadata = {
  title: "$GOLD Token - Hyperscape",
  description:
    "The official token of Hyperscape. 1 $GOLD = 1 gold in-game. Be the richest player at launch and get exclusive items.",
  openGraph: {
    title: "$GOLD Token - Hyperscape",
    description:
      "The official token of Hyperscape. 1 $GOLD = 1 gold in-game. Be the richest player at launch and get exclusive items.",
  },
};

export default function GoldPage() {
  return (
    <>
      <Background image="/images/gold_background.png" />
      <main className="relative z-10">
        <Header />
        <GoldToken />
        <Footer />
      </main>
    </>
  );
}
