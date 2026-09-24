import { createBackup } from '../src/lib/server/backup';
import { getConfig } from '../src/lib/server/config';

async function main() {
	const config = getConfig();
	try {
		const archivePath = await createBackup({
			dbPath: config.dbPath,
			mediaDir: config.mediaDir,
			backupDir: config.backupDir
		});
		console.log(archivePath);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`Échec de la sauvegarde : ${message}`);
		process.exit(1);
	}
}

main();
