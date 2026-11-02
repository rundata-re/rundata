/**
 * A byte range of a file (RFC 9110, one range « bytes=a-b », « bytes=a- » or « bytes=-n »): 206 with its Content-Range,
 * 416 past the file's end, the whole file otherwise (several ranges included, which a server may ignore). Accept-Ranges
 * says ranges are taken. For the demo video (worker.ts): the static assets answer a range with the whole file, and
 * Safari, on the iPhone and on the Mac, plays a video only from ranges.
 */
export async function plage(request: Request, file: Response, headers: Record<string, string> = {}): Promise<Response> {
  if (!file.ok) return file;
  const h = new Headers(file.headers);
  for (const [k, v] of Object.entries(headers)) h.set(k, v);
  h.set("accept-ranges", "bytes");
  const body = await file.arrayBuffer();
  const n = body.byteLength;
  const head = request.method === "HEAD";
  const m = /^bytes=(\d*)-(\d*)$/.exec((request.headers.get("range") ?? "").trim());
  if (!m || (!m[1] && !m[2])) {
    h.set("content-length", String(n));
    return new Response(head ? null : body, { status: 200, headers: h });
  }
  // « -n »: the last n bytes; « a- »: from a to the end; « a-b »: b cut at the end.
  const a = m[1] ? Number(m[1]) : Math.max(0, n - Number(m[2]));
  const b = m[1] && m[2] ? Math.min(Number(m[2]), n - 1) : n - 1;
  if (a >= n || a > b) {
    h.delete("content-length");
    h.set("content-range", `bytes */${n}`);
    return new Response(null, { status: 416, headers: h });
  }
  h.set("content-range", `bytes ${a}-${b}/${n}`);
  h.set("content-length", String(b - a + 1));
  return new Response(head ? null : body.slice(a, b + 1), { status: 206, headers: h });
}
