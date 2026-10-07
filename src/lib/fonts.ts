export interface FontOption {
	label: string;
	/** CSS font-family list used for the canvas. */
	css: string;
	weight: number;
	/** Set for fonts the user imported. */
	file?: File;
}

export const BUILTIN_FONTS: FontOption[] = [
	{ label: 'anton', css: 'Anton, Impact, sans-serif', weight: 400 },
	{ label: 'bebas neue', css: '"Bebas Neue", Impact, sans-serif', weight: 400 },
	{ label: 'montserrat', css: 'Montserrat, "Helvetica Neue", Arial, sans-serif', weight: 800 },
	{ label: 'permanent marker', css: '"Permanent Marker", cursive', weight: 400 },
	{ label: 'impact', css: 'Impact, "Arial Black", sans-serif', weight: 400 },
	{ label: 'georgia', css: 'Georgia, "Times New Roman", serif', weight: 700 },
	{ label: 'courier', css: '"Courier New", monospace', weight: 700 }
];

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
	return { label, css: `"${family}", sans-serif`, weight: 400, file };
}

export function unregisterFont(family: string) {
	const face = faces.get(family);
	if (face) document.fonts.delete(face);
	faces.delete(family);
}

export function familyOf(font: FontOption) {
	return font.css.match(/^"([^"]+)"/)?.[1] ?? font.label;
}
