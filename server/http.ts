/**
 * The slice of Next's server API the omp API handlers use.
 *
 * Only `NextResponse.json` (383 call sites) and `NextRequest.nextUrl` are
 * needed. Keeping the shim tiny let the handlers move out of Next unchanged;
 * they now run under the plain Node server in ./index.ts.
 */

export class NextResponse extends Response {
  static json(data: unknown, init: ResponseInit = {}): NextResponse {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new NextResponse(JSON.stringify(data), { ...init, headers });
  }

  static redirect(url: string | URL, status = 307): NextResponse {
    return new NextResponse(null, { status, headers: { location: String(url) } });
  }
}

/** A `Request` whose URL is also exposed as `nextUrl` (the handlers' only use). */
export class NextRequest extends Request {
  readonly nextUrl: URL;

  constructor(input: string | URL | Request, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
  }
}
