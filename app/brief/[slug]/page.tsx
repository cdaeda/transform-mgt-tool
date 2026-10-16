import { BriefView } from "../../brief-view";

// A briefing deck, full screen. The same view sits on the Presentation tab.
export default async function BriefPage({ params }: { params: Promise<{ slug: string }> }) {
  return <BriefView slug={(await params).slug} />;
}
