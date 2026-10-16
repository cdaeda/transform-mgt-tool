import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { Markdown } from "../markdown";

// The setup guide is README.md, read at build time (static: no request data is used).
export const metadata = { title: "Setup guide · Transform! Mgt Tool" };

export default function Setup() {
  const md = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <Link href="/" className="text-sm underline">← Back to the app</Link>
      <Markdown className="mt-4 text-[15px] leading-relaxed [&_h1]:!text-3xl [&_h2]:!text-xl [&_h2]:!mt-10 [&_h3]:!text-base [&_h3]:!mt-6 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-100 dark:[&_pre]:bg-zinc-900 [&_pre]:p-3 [&_pre]:text-xs [&_pre_code]:bg-transparent [&_table]:block [&_table]:overflow-x-auto [&_td]:align-top [&_td]:border-t [&_td]:border-zinc-200 [&_td]:p-1.5 [&_th]:p-1.5 [&_th]:text-left">{md}</Markdown>
    </main>
  );
}
