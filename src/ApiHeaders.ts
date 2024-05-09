class Headers {
  securityResponseHeaders = {
    "Content-Security-Policy":
      "default-src 'none'; script-src 'self'; frame-ancestors 'none'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}
