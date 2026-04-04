exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "Method not allowed." }),
    };
  }

  const targetUrl = process.env.GOOGLE_APPS_SCRIPT_URL || "";

  if (!targetUrl) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "GOOGLE_APPS_SCRIPT_URL is not configured." }),
    };
  }

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: event.body,
    });

    const text = await response.text();

    return {
      statusCode: response.status,
      headers: {
        "Content-Type": "application/json",
      },
      body: text || JSON.stringify({ ok: response.ok }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error.message || "Lead bridge failed.",
      }),
    };
  }
};
