import { NextResponse } from "next/server";
import { generateScripts } from "@/lib/claude";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { businessName, offer, style } = await req.json();
    const scripts = await generateScripts({ businessName, offer, style });
    return NextResponse.json({ scripts });
  } catch (e) {
    return NextResponse.json({ error: e.message || "scripts failed" }, { status: 500 });
  }
}
