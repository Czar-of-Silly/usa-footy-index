// functions/api/subscribe.js
// Cloudflare Pages Function — handles email signups securely
// The BEEHIIV_API_KEY is set as a Cloudflare environment variable, never exposed to browsers
//
// Deploy: Cloudflare Pages auto-detects functions/ directory and deploys these as serverless endpoints
// Endpoint: POST /api/subscribe with JSON { email: "user@example.com" }

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS for cross-origin requests
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  try {
    const body = await request.json();
    const email = (body.email || "").trim().toLowerCase();

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Get keys from Cloudflare environment
    const API_KEY = env.BEEHIIV_API_KEY;
    const PUB_ID = env.BEEHIIV_PUB_ID;

    if (!API_KEY || !PUB_ID) {
      console.error("Missing Beehiiv environment variables");
      return new Response(JSON.stringify({ error: "Service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Subscribe via Beehiiv API
    const beehiiveRes = await fetch(
      `https://api.beehiiv.com/v2/publications/${PUB_ID}/subscriptions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email,
          reactivate_existing: true,
          send_welcome_email: true,
          utm_source: "usfootyindex.com",
          utm_medium: "website"
        })
      }
    );

    if (!beehiiveRes.ok) {
      const errText = await beehiiveRes.text();
      console.error(`Beehiiv error ${beehiiveRes.status}: ${errText}`);
      return new Response(JSON.stringify({ error: "Subscription failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("Subscribe error:", e.message);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
