import { NextResponse } from "next/server";
import { validateSameOrigin } from "../../../../lib/security";
import { clearSession } from "../../../../lib/auth";

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  try {
    await clearSession();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout failed", error);
    return NextResponse.json({ error: "Unable to sign out." }, { status: 500 });
  }
}
