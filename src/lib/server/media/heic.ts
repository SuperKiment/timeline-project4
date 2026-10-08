import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';

/** Decoded HEIC pixels: 8-bit RGBA, row-major. */
export interface DecodedHeic {
	width: number;
	height: number;
	data: Uint8ClampedArray;
}

/**
 * Worker body. Inline (`eval`) rather than a separate file, so there is
 * nothing to locate once Vite has bundled the server (adapter-node), and
 * `heic-decode` is required by the absolute path resolved below: it behaves
 * the same under vitest, `vite dev` and `node build`.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
require(workerData.decoderPath)({ buffer: workerData.buffer }).then(({ width, height, data }) =>
	parentPort.postMessage({ width, height, data }, [data.buffer])
);
`;

const decoderPath = createRequire(import.meta.url).resolve('heic-decode');

/**
 * Decodes the first image of a HEIC/HEIF file to raw RGBA in a short-lived
 * worker thread: the libheif (WASM) decode takes seconds on a Raspberry Pi
 * and must not block the event loop. One worker per call keeps it simple
 * (uploads are processed sequentially) and releases the WASM heap afterwards.
 * Rejects when the file can't be decoded.
 */
export function decodeHeic(buffer: Uint8Array): Promise<DecodedHeic> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { decoderPath, buffer } });
		worker.once('message', resolve);
		worker.once('error', reject);
		// No-op after a successful `message` (the promise is already settled).
		worker.once('exit', (code) => reject(new Error(`HEIC worker exited (${code}).`)));
	});
}
