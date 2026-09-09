import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { AssistantWidget } from "@/components/assistant-widget";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const displaySerif = Instrument_Serif({
  variable: "--font-display-serif",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "People Machine",
  description:
    "Tell your story once. People Machine listens, and gets it in front of an attorney who handles cases like yours.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${displaySerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        {/* Mounted once for the whole site so a new public page gets the badge
            without being told to. It hides itself on /admin and on the two
            intakes — see HIDDEN_EXACT in the component. */}
        <AssistantWidget />
      </body>
    </html>
  );
}
