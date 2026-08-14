const UPSTREAM = "https://rabbitapi.zone.id";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length"
]);

module.exports = async (req, res) => {
  try {
    const originalPath =
      req.query?.path || "";

    const path = String(originalPath);

    // --------------------------------
    // Root request -> redirect
    // --------------------------------

    if (!path || path === "/") {
      res.statusCode = 302;
      res.setHeader(
        "Location",
        UPSTREAM + "/"
      );
      res.end();
      return;
    }

    // --------------------------------
    // Build upstream URL
    // --------------------------------

    const url = new URL(
      "/" + path.replace(/^\/+/, ""),
      UPSTREAM
    );

    // Preserve query parameters except
    // internal Vercel "path" parameter.
    for (const [key, value] of Object.entries(
      req.query || {}
    )) {
      if (key === "path") continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(
            key,
            String(item)
          );
        }
      } else if (value !== undefined) {
        url.searchParams.append(
          key,
          String(value)
        );
      }
    }

    // --------------------------------
    // Request headers
    // --------------------------------

    const headers = {};

    for (const [key, value] of Object.entries(
      req.headers
    )) {
      const lower = key.toLowerCase();

      if (HOP_BY_HOP.has(lower)) continue;

      if (Array.isArray(value)) {
        headers[key] = value.join(", ");
      } else if (value !== undefined) {
        headers[key] = value;
      }
    }

    headers["x-forwarded-host"] =
      req.headers.host || "";

    headers["x-forwarded-proto"] = "https";

    // --------------------------------
    // Request body
    // --------------------------------

    let body;

    if (!["GET", "HEAD"].includes(req.method)) {
      body = req;
    }

    // --------------------------------
    // Request upstream
    // --------------------------------

    const response = await fetch(url, {
      method: req.method,
      headers,
      body,
      redirect: "manual",

      ...(body
        ? {
            duplex: "half"
          }
        : {})
    });

    // --------------------------------
    // Response headers
    // --------------------------------

    for (const [key, value] of response.headers) {
      const lower = key.toLowerCase();

      if (HOP_BY_HOP.has(lower)) continue;

      res.setHeader(key, value);
    }

    // --------------------------------
    // CORS
    // --------------------------------

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "*"
    );

    res.setHeader(
      "Access-Control-Expose-Headers",
      "*"
    );

    // --------------------------------
    // Status code
    // --------------------------------

    res.statusCode = response.status;

    // --------------------------------
    // Stream response
    // --------------------------------

    if (!response.body) {
      res.end();
      return;
    }

    const reader =
      response.body.getReader();

    try {
      while (true) {
        const { done, value } =
          await reader.read();

        if (done) break;

        res.write(
          Buffer.from(value)
        );
      }
    } finally {
      reader.releaseLock();
    }

    res.end();

  } catch (error) {
    console.error(
      "RABBIT PROXY ERROR:",
      error
    );

    if (res.headersSent) {
      res.end();
      return;
    }

    res.statusCode = 502;

    res.setHeader(
      "Content-Type",
      "application/json"
    );

    res.end(
      JSON.stringify({
        success: false,
        error: "Bad Gateway",
        message:
          error?.message ||
          String(error)
      })
    );
  }
};
