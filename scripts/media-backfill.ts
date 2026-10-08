import { eq } from 'drizzle-orm';
import { getDb } from '../src/lib/server/db/index';
import { media } from '../src/lib/server/db/schema';
import { generateMissingVariants } from '../src/lib/server/media/images';

// Generates the `display` / `thumb-sm` variants missing for photos stored
// before they existed. Idempotent: photos already complete are skipped.
// Soft-deleted photos are included (they can be restored from the trash).
const photos = getDb()
	.select({ id: media.id, storedName: media.storedName })
	.from(media)
	.where(eq(media.kind, 'photo'))
	.all();

let generated = 0;
let failed = 0;
for (const photo of photos) {
	try {
		if ((await generateMissingVariants(photo.storedName)).length > 0) generated++;
	} catch (err) {
		failed++;
		const message = err instanceof Error ? err.message : String(err);
		console.error(`Média ${photo.id} (${photo.storedName}) : ${message}`);
	}
}

console.log(`${photos.length} photo(s), ${generated} complétée(s), ${failed} échec(s).`);
if (failed > 0) process.exitCode = 1;
