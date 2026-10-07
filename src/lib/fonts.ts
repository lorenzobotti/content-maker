export interface FontOption {
	label: string;
	/** CSS font-family list used for the canvas. */
	css: string;
	/** Default weight when the font is picked. */
	weight: number;
	/** Weights the user can choose from (bundled in +layout.svelte for built-ins). */
	weights: number[];
	/** Set for fonts the user imported. */
	file?: File;
}

export const BUILTIN_FONTS: FontOption[] = [
	{
		label: 'tiktok sans',
		css: '"TikTok Sans", "Helvetica Neue", Arial, sans-serif',
		weight: 400,
		weights: [300, 400, 500, 600, 700, 800, 900]
	},
	{
		label: 'open sans',
		css: '"Open Sans", "Helvetica Neue", Arial, sans-serif',
		weight: 400,
		weights: [300, 400, 500, 600, 700, 800]
	},
	{
		label: 'bitcount ink',
		css: '"Bitcount Ink", monospace',
		weight: 400,
		weights: [100, 200, 300, 400, 500, 600, 700, 800, 900]
	},
	{
		label: 'playwrite canada guides',
		css: '"Playwrite CA Guides", cursive',
		weight: 400,
		weights: [400]
	},
	{
		label: 'oswald',
		css: 'Oswald, Impact, sans-serif',
		weight: 700,
		weights: [200, 300, 400, 500, 600, 700]
	}
];

export const WEIGHT_NAMES: Record<number, string> = {
	100: 'thin',
	200: 'extra light',
	300: 'light',
	400: 'regular',
	500: 'medium',
	600: 'semibold',
	700: 'bold',
	800: 'extra bold',
	900: 'black'
};

export const FONT_FILE = /\.(ttf|otf|woff2?)$/i;

const faces = new Map<string, FontFace>();

/** Register an uploaded .ttf/.otf/.woff/.woff2 so the canvas can draw with it. */
export async function registerFont(file: File): Promise<FontOption> {
	const label =
		file.name
			.replace(FONT_FILE, '')
			.replace(/[^\w\s-]/g, ' ')
			.trim() || 'custom font';
	// Prefixed so it can't collide with a font installed on the system.
	const family = `User ${label}`;
	const face = new FontFace(family, await file.arrayBuffer());
	try {
		await face.load();
	} catch {
		throw new Error(`Unreadable font file: ${file.name}`);
	}
	unregisterFont(family);
	document.fonts.add(face);
	faces.set(family, face);
	// A single file is one weight; 700 lets the browser synthesise a bold.
	return { label, css: `"${family}", sans-serif`, weight: 400, weights: [400, 700], file };
}

export function unregisterFont(family: string) {
	const face = faces.get(family);
	if (face) document.fonts.delete(face);
	faces.delete(family);
}

export function familyOf(font: FontOption) {
	return font.css.match(/^"([^"]+)"/)?.[1] ?? font.label;
}
