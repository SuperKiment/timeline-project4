import { stdin, stdout } from 'node:process';
import { createUser } from '../src/lib/server/auth/users';
import { getConfig } from '../src/lib/server/config';
import { getDb } from '../src/lib/server/db/index';
import { runMigrations } from '../src/lib/server/db/migrate';

/** Parses `--key value` and `--key=value` pairs from CLI args. */
function parseArgs(argv: string[]): Record<string, string> {
	const args: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith('--')) continue;

		const eq = arg.indexOf('=');
		if (eq !== -1) {
			args[arg.slice(2, eq)] = arg.slice(eq + 1);
			continue;
		}

		const key = arg.slice(2);
		const next = argv[i + 1];
		if (next !== undefined && !next.startsWith('--')) {
			args[key] = next;
			i++;
		} else {
			args[key] = '';
		}
	}
	return args;
}

/** Reads the whole of a non-TTY stdin and strips trailing newline(s). */
async function readPasswordFromStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of stdin) {
		chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks)
		.toString('utf8')
		.replace(/(\r?\n)+$/, '');
}

/** Prompts on a TTY without echoing typed characters. Ctrl-C exits with 130. */
async function promptHidden(label: string): Promise<string> {
	stdout.write(label);
	stdin.setRawMode(true);
	stdin.resume();
	stdin.setEncoding('utf8');
	let input = '';
	try {
		return await new Promise<string>((resolve) => {
			const onData = (data: string) => {
				for (const ch of data) {
					if (ch === '\r' || ch === '\n' || ch === '\u0004') {
						stdin.off('data', onData);
						resolve(input);
						return;
					}
					if (ch === '\u0003') {
						stdin.setRawMode(false);
						stdout.write('\n');
						process.exit(130);
					}
					if (ch === '\u007f' || ch === '\b') {
						input = Array.from(input).slice(0, -1).join('');
						continue;
					}
					input += ch;
				}
			};
			stdin.on('data', onData);
		});
	} finally {
		stdin.setRawMode(false);
		stdin.pause();
		stdout.write('\n');
	}
}

async function promptPassword(): Promise<string> {
	const password = await promptHidden('Mot de passe : ');
	const confirmation = await promptHidden('Confirmez : ');
	if (password !== confirmation) {
		console.error('Les mots de passe ne correspondent pas.');
		process.exit(1);
	}
	return password;
}

/** Password sources, by priority: --password, USER_PASSWORD, piped stdin, masked prompt. */
async function resolvePassword(argPassword: string | undefined): Promise<string> {
	if (argPassword) {
		if (stdin.isTTY) {
			console.error(
				"Attention : --password est visible dans l'historique et ps ; préférez USER_PASSWORD ou l'invite."
			);
		}
		return argPassword;
	}
	if (process.env.USER_PASSWORD) return process.env.USER_PASSWORD;
	if (!stdin.isTTY) return readPasswordFromStdin();
	return promptPassword();
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	// B4 security review: usernames are always stored lowercase so login can
	// look them up consistently.
	const username = args.username?.trim().toLowerCase();
	const displayName = args['display-name']?.trim();

	if (!username || !displayName) {
		console.error(
			'Usage : user:create --username <identifiant> --display-name <nom affiché> [--password <mot de passe>]\n' +
				'Mot de passe : --password, sinon variable USER_PASSWORD, sinon stdin (pipe), sinon invite masquée.'
		);
		process.exit(1);
	}

	const password = await resolvePassword(args.password);

	if (!password) {
		console.error('Mot de passe requis.');
		process.exit(1);
	}

	const config = getConfig();
	const db = getDb();
	runMigrations(db);

	try {
		const user = await createUser(db, { username, displayName, password });
		console.log(`Utilisateur créé : ${user.username} (id=${user.id}) dans ${config.dbPath}`);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`Échec de la création de l'utilisateur : ${message}`);
		process.exit(1);
	}
}

main();
