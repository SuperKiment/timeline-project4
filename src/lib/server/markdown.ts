import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
	'p',
	'br',
	'strong',
	'em',
	'ul',
	'ol',
	'li',
	'blockquote',
	'code',
	'pre',
	'a',
	'h3',
	'h4',
	'h5',
	'h6'
];

const marked = new Marked();

/**
 * Renders markdown to sanitized HTML. `marked` is never trusted to produce
 * safe output on its own (it happily passes raw HTML through) - the result
 * is always run through a strict sanitize-html allowlist before returning.
 */
export function renderMarkdown(src: string): string {
	const html = marked.parse(src, { async: false });
	return sanitizeHtml(html, {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: {
			a: ['href', 'rel', 'target']
		},
		allowedSchemes: ['http', 'https', 'mailto'],
		allowProtocolRelative: false,
		transformTags: {
			a: (tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag => {
				const newAttribs: sanitizeHtml.Attributes = { ...attribs, rel: 'noopener noreferrer' };
				if (newAttribs.target !== '_blank') {
					delete newAttribs.target;
				}
				return { tagName, attribs: newAttribs };
			}
		}
	});
}
