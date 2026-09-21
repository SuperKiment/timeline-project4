import { spawn } from 'node:child_process';
import fs from 'node:fs';

/** Kill a stuck ffmpeg process after this many milliseconds and treat it as a failure. */
const RUN_TIMEOUT_MS = 30_000;

/** Cached {@link hasFfmpeg} probe results, keyed by binary name (tests probe an absent binary). */
const availabilityCache = new Map<string, boolean>();

function run(bin: string, args: string[]): Promise<boolean> {
	return new Promise((resolve) => {
		let child;
		try {
			child = spawn(bin, args, { stdio: 'ignore' });
		} catch {
			resolve(false);
			return;
		}

		let settled = false;
		const finish = (result: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(result);
		};

		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			finish(false);
		}, RUN_TIMEOUT_MS);

		child.on('error', () => finish(false));
		child.on('exit', (code) => finish(code === 0));
	});
}

/** Whether the `bin` ffmpeg binary is available. Result is cached per binary name. */
export async function hasFfmpeg(bin = 'ffmpeg'): Promise<boolean> {
	const cached = availabilityCache.get(bin);
	if (cached !== undefined) {
		return cached;
	}
	const available = await run(bin, ['-version']);
	availabilityCache.set(bin, available);
	return available;
}

async function extractFrame(
	bin: string,
	videoPath: string,
	outPath: string,
	seekSeconds: number
): Promise<boolean> {
	const ok = await run(bin, [
		'-y',
		'-nostdin',
		'-protocol_whitelist',
		'file',
		'-ss',
		String(seekSeconds),
		'-i',
		videoPath,
		'-frames:v',
		'1',
		'-vf',
		'scale=400:-1',
		outPath
	]);
	return ok && fs.existsSync(outPath);
}

/**
 * Extracts a 400px-wide JPEG poster frame from `videoPath` at 1s (falling back to 0s
 * for very short videos) and writes it to `outPath`. Never throws: returns `false`
 * when ffmpeg is missing, hangs (killed after 30s), or extraction fails at both
 * offsets (EC-11).
 */
export async function makePoster(
	videoPath: string,
	outPath: string,
	bin = 'ffmpeg'
): Promise<boolean> {
	if (!(await hasFfmpeg(bin))) {
		return false;
	}
	try {
		if (await extractFrame(bin, videoPath, outPath, 1)) {
			return true;
		}
		return await extractFrame(bin, videoPath, outPath, 0);
	} catch {
		return false;
	}
}
