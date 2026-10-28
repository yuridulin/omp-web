import { NextResponse } from "../../http";
import { homedir } from "os";

export async function GET() {
  return NextResponse.json({ home: homedir() });
}
