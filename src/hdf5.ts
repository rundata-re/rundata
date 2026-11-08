/**
 * Reads 2-D chunked datasets out of an HDF5 file, as far as Météo-France's ODIM radar composites need: superblock v0,
 * data layout message v3 (chunked), chunk index in a version 1 B-tree, chunks deflated with no other filter. Anything
 * else is refused rather than guessed. Inflating goes through the platform's DecompressionStream, like zip.ts.
 *
 * The layout messages are found by their bytes (version 3, class 2 = chunked, rank + 1 = 3) followed by an address
 * that holds a B-tree ("TREE"), instead of walking the object headers: much shorter, and the B-tree check keeps it
 * from matching stray bytes.
 */

export interface Chunked {
  /** Rows and columns of one chunk. */
  chunkRows: number;
  cols: number;
  /** Bytes per value: 1 (uint8) or 2 (uint16). */
  size: 1 | 2;
  /** First row of each chunk, its address and compressed size, sorted by row. */
  chunks: { row: number; addr: number; bytes: number }[];
}

const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));

function isTree(b: Uint8Array, at: number): boolean {
  return at + 4 <= b.length && b[at] === 0x54 && b[at + 1] === 0x52 && b[at + 2] === 0x45 && b[at + 3] === 0x45;
}

function leaves(v: DataView, b: Uint8Array, addr: number, out: Chunked["chunks"], depth = 0): void {
  if (!isTree(b, addr) || b[addr + 4] !== 1 || depth > 8) throw new Error("hdf5 : index de chunks illisible");
  const level = b[addr + 5];
  const entries = v.getUint16(addr + 6, true);
  // Header: signature, node type, level, entries used, left and right siblings. Then per entry a key (chunk size,
  // filter mask, one offset per dimension plus one for the element) and the child's address.
  let p = addr + 24;
  for (let k = 0; k < entries; k++) {
    const bytes = v.getUint32(p, true);
    const mask = v.getUint32(p + 4, true);
    const row = u64(v, p + 8);
    const child = u64(v, p + 32);
    if (level > 0) leaves(v, b, child, out, depth + 1);
    else if (mask !== 0) throw new Error("hdf5 : chunk sans son filtre deflate");
    else out.push({ row, addr: child, bytes });
    p += 40;
  }
}

/** Every 2-D chunked dataset of the file, in file order. Throws when the file is not one this code can read. */
export function datasets(data: ArrayBuffer): Chunked[] {
  const b = new Uint8Array(data);
  const v = new DataView(data);
  // Superblock v0 at offset 0 with 8-byte addresses and lengths.
  if (v.getUint32(0) !== 0x89484446 || b[8] !== 0 || b[13] !== 8 || b[14] !== 8) throw new Error("hdf5 : en-tête non pris en charge");
  const out: Chunked[] = [];
  for (let i = 0; i < b.length - 23; i++) {
    if (b[i] !== 3 || b[i + 1] !== 2 || b[i + 2] !== 3) continue;
    const tree = u64(v, i + 3);
    const size = v.getUint32(i + 19, true);
    if ((size !== 1 && size !== 2) || !isTree(b, tree)) continue;
    const chunks: Chunked["chunks"] = [];
    leaves(v, b, tree, chunks);
    out.push({ chunkRows: v.getUint32(i + 11, true), cols: v.getUint32(i + 15, true), size, chunks: chunks.sort((x, y) => x.row - y.row) });
  }
  return out;
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer();
}

/**
 * Rows `from` to `to` (excluded), columns `c0` to `c1` (excluded), as one flat array of (to - from) × (c1 - c0)
 * values. Only the chunks holding those rows are inflated.
 */
export async function crop(data: ArrayBuffer, d: Chunked, from: number, to: number, c0: number, c1: number): Promise<Uint16Array> {
  const width = c1 - c0;
  const out = new Uint16Array((to - from) * width);
  for (const c of d.chunks) {
    if (c.row + d.chunkRows <= from || c.row >= to) continue;
    const raw = await inflate(new Uint8Array(data, c.addr, c.bytes));
    const values = d.size === 2 ? new Uint16Array(raw) : new Uint8Array(raw);
    if (values.length !== d.chunkRows * d.cols) throw new Error("hdf5 : chunk de taille inattendue");
    for (let r = Math.max(from, c.row); r < Math.min(to, c.row + d.chunkRows); r++) {
      const src = (r - c.row) * d.cols;
      out.set(values.subarray(src + c0, src + c1), (r - from) * width);
    }
  }
  return out;
}

// --- Variables found by name: the NetCDF-4 files of NOAA's GHRSST products (providers/acspo.ts, providers/viirs.ts) ---

/**
 * `length` bytes of the file from `offset`: the whole file in memory, or a range asked of the server. Fewer bytes may
 * come back at the end of the file.
 */
export type Reader = (offset: number, length: number) => Promise<Uint8Array>;

/** A reader over a file already in memory. */
export const inMemory = (data: ArrayBuffer): Reader => async (offset, length) => new Uint8Array(data, offset, Math.min(length, data.byteLength - offset));

/** A chunked variable of a NetCDF-4 file: its chunks' sizes along its last two dimensions, its filters and its chunks. */
export interface Variable {
  /** Bytes per value: 1, 2 or 4, signed. */
  size: 1 | 2 | 4;
  chunkRows: number;
  chunkCols: number;
  /** HDF5 filter ids, in the order they were applied when writing: 2 shuffle, 1 deflate, 3 Fletcher-32. */
  filters: number[];
  /**
   * The chunks written, by their first row and column; a chunk not listed holds only the fill value. `skip`: bit k set
   * when the k-th filter was not applied to this chunk (a deflate that would not have made it smaller).
   */
  chunks: { row: number; col: number; addr: number; bytes: number; skip: number }[];
}

// Bytes read at once for a header, a heap block or an index node: enough for those of the files of NOAA seen, a larger
// one read again whole.
const HEAD = 4096;

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const sig = (b: Uint8Array, at: number, s: string) => [...s].every((ch, i) => b[at + i] === ch.charCodeAt(0));
const n64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));

interface Message { type: number; body: Uint8Array }

/** The messages of a version 2 object header at `addr`, its continuation blocks included. */
async function messages(read: Reader, addr: number): Promise<Message[]> {
  let b = await read(addr, HEAD);
  if (!sig(b, 0, "OHDR") || b[4] !== 2) throw new Error("hdf5 : en-tête d'objet non pris en charge");
  const flags = b[5];
  let p = 6 + (flags & 0x20 ? 16 : 0) + (flags & 0x10 ? 4 : 0);
  const width = 1 << (flags & 3);
  const first = Number(width === 8 ? view(b).getBigUint64(p, true) : width === 4 ? view(b).getUint32(p, true) : width === 2 ? view(b).getUint16(p, true) : b[p]);
  p += width;
  if (p + first > b.length) b = await read(addr, p + first + 4);
  const out: Message[] = [];
  const walk = async (block: Uint8Array, from: number, to: number) => {
    const v = view(block);
    let q = from;
    while (q + 4 <= to) {
      const type = block[q];
      const len = v.getUint16(q + 1, true);
      q += 4 + (flags & 0x04 ? 2 : 0);
      const body = block.subarray(q, q + len);
      q += len;
      if (type === 16) {
        const [at, size] = [n64(view(body), 0), n64(view(body), 8)];
        const c = await read(at, size);
        if (!sig(c, 0, "OCHK")) throw new Error("hdf5 : suite d'en-tête illisible");
        await walk(c, 4, size - 4);
      } else if (type !== 0) out.push({ type, body });
    }
  };
  await walk(b, p, p + first);
  return out;
}

/**
 * The address of the object header of the root group's link `name`: in the header itself (compact links) or in the
 * fractal heap of its links (dense links, more than 8), when that heap is a single direct block, as in NOAA's files.
 */
async function linkAddress(read: Reader, name: string): Promise<number> {
  // The superblock, and the root group's header right after it in the files seen.
  const sb = await read(0, 2 * HEAD);
  if (view(sb).getUint32(0) !== 0x89484446 || sb[8] !== 0 || sb[13] !== 8 || sb[14] !== 8) throw new Error("hdf5 : en-tête non pris en charge");
  const root = n64(view(sb), 64);
  const want = new TextEncoder().encode(name);
  // A link names its target after its name's length (one byte, these names being short): find `name` preceded by its
  // length and followed by an address that holds an object header.
  const find = async (b: Uint8Array): Promise<number | undefined> => {
    for (let i = 1; i + want.length + 8 <= b.length; i++) {
      if (b[i - 1] !== want.length || !want.every((x, k) => b[i + k] === x)) continue;
      const at = n64(view(b), i + want.length);
      // HEAD bytes, as messages() reads them next: a resumable reader keeps them for it.
      if (sig(await read(at, HEAD), 0, "OHDR")) return at;
    }
    return undefined;
  };
  for (const m of await messages(read, root)) {
    if (m.type === 6) {
      const at = await find(m.body);
      if (at != null) return at;
    }
    if (m.type === 2) {
      // Link info: version, flags, the largest creation index if tracked, then the fractal heap's address.
      const heap = n64(view(m.body), 2 + (m.body[1] & 1 ? 8 : 0));
      const h = await read(heap, 256);
      if (!sig(h, 0, "FRHP")) throw new Error("hdf5 : tas des liens illisible");
      const hv = view(h);
      // After the fixed fields: table width (2), starting block size (8), largest direct block (8), largest heap size
      // (2), starting rows of the root indirect block (2), root block's address (8), its current rows (2).
      const filtered = hv.getUint16(7, true) > 0;
      const width = hv.getUint16(110, true);
      const start = n64(hv, 112);
      const offsetBytes = Math.ceil(hv.getUint16(128, true) / 8);
      const rootBlock = n64(hv, 132);
      const rows = hv.getUint16(140, true);
      if (filtered) throw new Error("hdf5 : tas des liens non pris en charge");
      // The root block is a direct block when the root has no rows, else an indirect block whose rows list direct blocks,
      // of the starting size in its first two rows, twice the size of the row before in each next one.
      const blocks: [number, number][] = [];
      if (rows === 0) blocks.push([rootBlock, start]);
      else {
        const ib = await read(rootBlock, 13 + offsetBytes + rows * width * 8 + 4);
        if (!sig(ib, 0, "FHIB")) throw new Error("hdf5 : bloc du tas des liens illisible");
        for (let r = 0, q = 13 + offsetBytes; r < rows; r++) {
          for (let k = 0; k < width; k++, q += 8) {
            const at = n64(view(ib), q);
            if (at !== 2 ** 64 - 1 && at < 2 ** 53) blocks.push([at, r < 2 ? start : start * 2 ** (r - 1)]);
          }
        }
      }
      for (const [at, size] of blocks) {
        const block = await read(at, size);
        if (!sig(block, 0, "FHDB")) throw new Error("hdf5 : bloc du tas des liens illisible");
        const found = await find(block);
        if (found != null) return found;
      }
    }
  }
  throw new Error(`hdf5 : variable ${name} absente`);
}

/** The chunks indexed by the version 1 B-tree at `addr`, for a layout of `dims` dimensions (the element's included). */
async function chunkIndex(read: Reader, addr: number, dims: number, out: Variable["chunks"], depth = 0): Promise<void> {
  let b = await read(addr, HEAD);
  if (!sig(b, 0, "TREE") || b[4] !== 1 || depth > 8) throw new Error("hdf5 : index de chunks illisible");
  const level = b[5];
  const entries = view(b).getUint16(6, true);
  const key = 8 + 8 * dims;
  const need = 24 + entries * (key + 8) + key;
  if (need > b.length) b = await read(addr, need);
  const v = view(b);
  for (let k = 0, p = 24; k < entries; k++, p += key + 8) {
    const child = n64(v, p + key);
    // The key: the chunk's stored size, its filter mask, then its offset along each dimension.
    if (level > 0) await chunkIndex(read, child, dims, out, depth + 1);
    else out.push({ bytes: v.getUint32(p, true), skip: v.getUint32(p + 4, true), row: n64(v, p + 8 + 8 * (dims - 3)), col: n64(v, p + 8 + 8 * (dims - 2)), addr: child });
  }
}

/** The variable `name` of the root group: its type's size, chunks and filters. Throws on anything else. */
export async function variable(read: Reader, name: string): Promise<Variable> {
  const ms = await messages(read, await linkAddress(read, name));
  const layout = ms.find((m) => m.type === 8)?.body;
  const type = ms.find((m) => m.type === 3)?.body;
  const pipeline = ms.find((m) => m.type === 11)?.body;
  // Layout version 3, class 2 (chunked): dimensions (the element's included), the B-tree's address, then each chunk size.
  if (!layout || layout[0] !== 3 || layout[1] !== 2 || !type) throw new Error(`hdf5 : ${name} n'est pas découpée en chunks`);
  const dims = layout[2];
  const lv = view(layout);
  const size = view(type).getUint32(4, true);
  // Fixed-point (class 0), little-endian (bit 0 of the class bits clear).
  if ((type[0] & 0x0f) !== 0 || type[1] & 1 || (size !== 1 && size !== 2 && size !== 4)) throw new Error(`hdf5 : type de ${name} non pris en charge`);
  const filters: number[] = [];
  if (pipeline) {
    const version = pipeline[0];
    const count = pipeline[1];
    let p = version === 1 ? 8 : 2;
    const pv = view(pipeline);
    for (let k = 0; k < count; k++) {
      const id = pv.getUint16(p, true);
      const nameLen = version === 1 || id >= 256 ? pv.getUint16(p + 2, true) : 0;
      const values = pv.getUint16(p + (version === 1 || id >= 256 ? 6 : 4), true);
      p += (version === 1 || id >= 256 ? 8 : 6) + (version === 1 ? Math.ceil(nameLen / 8) * 8 : nameLen) + 4 * values;
      if (version === 1 && values % 2) p += 4;
      if (id !== 1 && id !== 2 && id !== 3) throw new Error(`hdf5 : filtre ${id} de ${name} non pris en charge`);
      filters.push(id);
    }
  }
  const chunks: Variable["chunks"] = [];
  await chunkIndex(read, n64(lv, 3), dims, chunks);
  return { size: size as 1 | 2 | 4, chunkRows: lv.getUint32(11 + 4 * (dims - 3), true), chunkCols: lv.getUint32(11 + 4 * (dims - 2), true), filters, chunks };
}

/**
 * Rows `r0` to `r1` and columns `c0` to `c1` (excluded) of the last two dimensions of `v`, the first ones at 0, as one
 * flat array, row after row; `fill` where no chunk was written. Only the chunks holding them are read and unpacked.
 */
export async function region(read: Reader, v: Variable, r0: number, r1: number, c0: number, c1: number, fill: number): Promise<Int32Array> {
  const width = c1 - c0;
  const out = new Int32Array((r1 - r0) * width).fill(fill);
  const count = v.chunkRows * v.chunkCols;
  for (const c of v.chunks) {
    if (c.row + v.chunkRows <= r0 || c.row >= r1 || c.col + v.chunkCols <= c0 || c.col >= c1) continue;
    let raw = (await read(c.addr, c.bytes)).slice();
    let shuffled = false;
    for (const [k, f] of [...v.filters.entries()].reverse()) {
      if (c.skip & (1 << k)) continue;
      if (f === 3) raw = raw.slice(0, raw.length - 4);
      else if (f === 1) raw = new Uint8Array(await inflate(raw));
      else shuffled = true;
    }
    if (raw.length !== count * v.size) throw new Error("hdf5 : chunk de taille inattendue");
    // Shuffled, byte k of every value comes in the k-th plane of `count` bytes: gathered for the values kept only.
    const at = (i: number) => {
      let x = 0;
      for (let k = 0; k < v.size; k++) x |= raw[shuffled ? k * count + i : i * v.size + k] << (8 * k);
      return v.size === 4 ? x : v.size === 2 ? (x << 16) >> 16 : (x << 24) >> 24;
    };
    for (let r = Math.max(r0, c.row); r < Math.min(r1, c.row + v.chunkRows); r++) {
      for (let col = Math.max(c0, c.col); col < Math.min(c1, c.col + v.chunkCols); col++) {
        out[(r - r0) * width + (col - c0)] = at((r - c.row) * v.chunkCols + (col - c.col));
      }
    }
  }
  return out;
}

/** Thrown by a resumable reader whose reads for this time are spent: the work goes on at its next call. */
export class ReadsSpent extends Error {
  constructor() {
    super("hdf5 : lectures épuisées pour cette fois");
  }
}

/** A range kept between two calls: its offset and its bytes in base 64. */
export interface Kept {
  o: number;
  b: string;
}

const KEPT_MAX = 64 * 1024;
const toB64 = (b: Uint8Array) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join(""));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

/**
 * A reader of a file asked by ranges, over several calls: the ranges kept from the calls before answer, and at most
 * `budget` new ranges are asked (`fetchRange`), after which it throws ReadsSpent. The new ranges up to 64 kB are added
 * to `kept`, for the next call; a larger one (a chunk) is used at once and not kept.
 */
export function resumable(kept: Kept[], fetchRange: (offset: number, length: number) => Promise<Uint8Array>, budget = 1): Reader {
  const have: { o: number; b: Uint8Array }[] = kept.map((k) => ({ o: k.o, b: fromB64(k.b) }));
  let left = budget;
  return async (offset, length) => {
    const hit = have.find((k) => offset >= k.o && offset + length <= k.o + k.b.length);
    if (hit) return hit.b.subarray(offset - hit.o, offset - hit.o + length);
    if (left <= 0) throw new ReadsSpent();
    left--;
    const b = await fetchRange(offset, length);
    if (b.length <= KEPT_MAX) {
      have.push({ o: offset, b });
      kept.push({ o: offset, b: toB64(b) });
    }
    return b;
  };
}
