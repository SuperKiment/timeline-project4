import { describe, expect, it } from 'vitest';
import { viewerSrcset } from './variants';

const urls = { thumbUrl: '/media/1/thumb', displayUrl: '/media/1/display' };

describe('viewerSrcset', () => {
	it('mirrors the server resize (display long edge capped at 2048, thumb 400 wide)', () => {
		expect(viewerSrcset({ ...urls, width: 4032, height: 3024 })).toBe(
			'/media/1/thumb 400w, /media/1/display 2048w'
		);
		expect(viewerSrcset({ ...urls, width: 2000, height: 3000 })).toBe(
			'/media/1/thumb 400w, /media/1/display 1365w'
		);
	});

	it('never enlarges small photos', () => {
		expect(viewerSrcset({ ...urls, width: 300, height: 200 })).toBe(
			'/media/1/thumb 300w, /media/1/display 300w'
		);
	});

	it('is undefined when the dimensions are unknown', () => {
		expect(viewerSrcset({ ...urls, width: null, height: null })).toBeUndefined();
	});
});
