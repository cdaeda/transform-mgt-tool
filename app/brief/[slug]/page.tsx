import { BRIEFS } from "@/lib/brief";
import { BriefView } from "../../brief-view";

// The briefings are known in advance, so each page is prerendered.
export function generateStaticParams() {
  return Object.keys(BRIEFS).map((slug) => ({ slug }));
}

// A briefing deck, full screen. The same view sits on the Presentation tab.
export default async function BriefPage({ params }: { params: Promise<{ slug: string }> }) {
  return <BriefView slug={(await params).slug} />;
}
