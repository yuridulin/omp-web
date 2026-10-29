/**
 * The slice of Next's server API the omp API handlers use.
 *
 * Only `NextResponse.json` (383 call sites) and `NextRequest.nextUrl` are
 * needed. Keeping the shim tiny let the handlers move out of Next unchanged;
 * they now run under the Bun server in ./index.ts.
 */

export class NextResponse extends Response {
  static json(data: unknown, init: ResponseInit = {}): NextResponse {
    // Bun's HeadersInit differs from the DOM-less undici fallback on ResponseInit.
    const headers = new Headers(init.headers as Bun.HeadersInit);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new NextResponse(JSON.stringify(data), { ...init, headers });
  }
}

/** A `Request` whose URL is also exposed as `nextUrl` (the handlers' only use). */
export class NextRequest extends Request {
  readonly nextUrl: URL;

  constructor(input: string | URL, init?: RequestInit) {
    super(String(input), init);
    this.nextUrl = new URL(String(input));
  }
}
