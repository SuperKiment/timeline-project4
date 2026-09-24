/**
 * Error carrying an HTTP status code. Services throw it for expected failure
 * cases (validation, authorization, not found); routes/hooks catch it and
 * turn it into the matching HTTP response.
 */
export class HttpError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
		this.name = 'HttpError';
	}
}
