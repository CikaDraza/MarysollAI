import { NextResponse } from "next/server";
import axios from "axios";

export async function GET(req: Request) {
  const MAIN_SITE_API = process.env.MAIN_SITE_API;
  try {
    const { searchParams } = new URL(req.url);
    const externalUrl = `${MAIN_SITE_API}/testimonials?${searchParams.toString()}`;

    const response = await axios.get(externalUrl, {
      headers: {
        Authorization: req.headers.get("authorization") || "",
      },
    });

    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Error fetching testimonials:", error);
    return NextResponse.json(
      { error: "Error fetching testimonials" },
      { status: 500 },
    );
  }
}
