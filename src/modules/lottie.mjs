//         0
//   5            1
//      9      6
//         a
//      8      7
//   4            2
//         3

import fontShapes from './ExoBold.mjs';
import { glyphs } from './glyphs.mjs';

let config = {
	scale: 200,
	originX: 512 / 2,
	originY: 512 / 2 + 20,
	fontSize: 20,
	fontSpacing: 5,
};

//0-9,a
const polarNodes = [
	{ mag: 1.0, deg: 90.0 },
	{ mag: 1.0, deg: 30.0 },
	{ mag: 1.0, deg: -30.0 },
	{ mag: 1.0, deg: -90.0 },
	{ mag: 1.0, deg: -150.0 },
	{ mag: 1.0, deg: 150.0 },
	{ mag: 0.5, deg: 30.0 },
	{ mag: 0.5, deg: -30.0 },
	{ mag: 0.5, deg: -150.0 },
	{ mag: 0.5, deg: 150.0 },
	{ mag: 0.0, deg: 0.0 },
];
let cartesianNodes = getNodeCoordinates(config.scale, config.originX, config.originY);

function polarToCartesian(mag, deg) {
	const rad = deg * (Math.PI / 180);
	return { x: +(mag * Math.cos(rad)), y: mag * Math.sin(rad) };
}

function getNodeCoordinates(scale, originX, originY) {
	return polarNodes.map((node) => {
		const { x, y } = polarToCartesian(node.mag, node.deg);
		return {
			x: originX + x * scale,
			y: originY - y * scale,
		};
	});
}

function generateGlyphData(glyphString) {
	const edges = [];
	for (let i = 0; i < glyphString.length - 1; i++) {
		const startIndex = parseInt(glyphString[i], 16);
		const endIndex = parseInt(glyphString[i + 1], 16);

		edges.push({
			start: { x: +cartesianNodes[startIndex].x.toFixed(2), y: +cartesianNodes[startIndex].y.toFixed(2) },
			end: { x: +cartesianNodes[endIndex].x.toFixed(2), y: +cartesianNodes[endIndex].y.toFixed(2) },
		});
	}
	return edges;
}

function processInput(input) {
	return input
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function createCalibrationGrid() {
	return {
		nm: 'CalibrationGrid',
		ty: 4,
		op: 180,
		st: 0,
		ip: 0,
		ks: {
			a: { k: [0, 0], a: 0 },
			p: { k: [0, 0], a: 0 },
			s: { k: [100, 100], a: 0 },
			r: { k: 0, a: 0 },
			o: { k: 100, a: 0 },
			sk: { k: 0, a: 0 },
			sa: { k: 0, a: 0 },
		},
		shapes: [
			...cartesianNodes.map((node) => ({
				ty: 'el',
				p: { a: 0, k: [+node.x.toFixed(2), +node.y.toFixed(2)] },
				s: { a: 0, k: [20, 20] },
				nm: 'Circle Path',
			})),
			{
				ty: 'st',
				c: { a: 0, k: [1, 1, 1, 1] },
				o: { a: 0, k: 100 },
				w: { a: 0, k: 3 },
				lc: 2,
				lj: 1,
				ml: 10,
				bm: 0,
				nm: 'Stroke',
			},
		],
	};
}

function createPathShape(points) {
	const vertices = points.map((point) => [point.x, point.y]);
	const visitedVertices = new Set();
	const generateRandomTangent = () => [+(21 * Math.random() - 9).toFixed(2), +(21 * Math.random() - 9).toFixed(2)];

	let inTangents = [];
	for (let i = 0; i < points.length; i++) {
		const key = `${points[i].x},${points[i].y}`;
		if (visitedVertices.has(key)) {
			inTangents.push(generateRandomTangent());
		} else {
			visitedVertices.add(key);
			inTangents.push([0, 0]);
		}
	}

	let outTangents = points.map(() => [0, 0]);

	return {
		ty: 'sh',
		ks: {
			a: 0,
			k: {
				i: inTangents,
				o: outTangents,
				v: vertices,
				c: false, //don't close the shape, just connect the dots
			},
		},
	};
}

function createLottieCharacter(character, shapeData) {
	// Calculate the width of the character based on its shape data
	let characterWidth = 0;
	if (shapeData && shapeData.length > 0) {
		// Find the maximum width among all shapes in shapeData
		characterWidth = shapeData.reduce((maxWidth, shape) => {
			if (shape && shape.ks && shape.ks.k && shape.ks.k.v) {
				const vertices = shape.ks.k.v;
				const maxX = Math.max(...vertices.map((vertex) => vertex[0]));
				if (maxX > maxWidth) {
					return maxX;
				}
			}
			return maxWidth;
		}, 0);
	}

	// Adjust the position of the character based on its calculated width
	const startX = characterWidth / 2;

	return {
		nm: `char ${character}`,
		ddd: 0,
		ty: 4,
		ind: 0,
		sr: 1,
		ip: 0,
		op: 180,
		st: 0,
		ks: {
			a: { k: [0, 0], a: 0 },
			p: { k: [0, 0], a: 0 },
			s: { k: [100, 100], a: 0 },
			r: { k: 0, a: 0 },
			o: { k: 100, a: 0 },
			sk: { k: 0, a: 0 },
			sa: { k: 0, a: 0 },
		},
		ao: 0,
		bm: 0,
		shapes: [
			{
				ty: 'gr',
				it: shapeData.concat([
					{
						ty: 'tr',
						a: { k: [0, 0], a: 0 },
						p: { k: [startX, 0], a: 0 }, // Adjust startX based on character width
						s: { k: [100, 100], a: 0 },
						r: { k: 0, a: 0 },
						o: { k: 100, a: 0 },
						sk: { k: 0, a: 0 },
						sa: { k: 0, a: 0 },
					},
				]),
			},
			{
				ty: 'fl',
				o: { k: 100, a: 0 },
				c: { k: [1, 1, 1, 1], a: 0 },
			},
		],
	};
}

function drawWordLayer(word, xOffset = 0, yOffset = 0, startFrame = 0, endFrame = 180) {
	let totalWidth = 0;

	// Calculate total width of the word based on each character
	const layers = word
		.split('')
		.map((char, index) => {
			const shapeLayer = fontShapes[char];
			if (shapeLayer) {
				let glyphCharacter = createLottieCharacter(char, shapeLayer);

				// Calculate position for each character based on accumulated width
				const startX = totalWidth + xOffset;
				const startY = yOffset + config.fontSize / 2;

				// Update position and timing for the character
				glyphCharacter.shapes[0].it.slice(-1)[0].p.k = [startX, startY];
				glyphCharacter.ip = startFrame;
				glyphCharacter.op = endFrame;

				// Accumulate the width for the next character
				const charWidth = calculateCharacterWidth(shapeLayer);
				totalWidth += charWidth + config.fontSpacing;

				return glyphCharacter;
			} else {
				totalWidth += config.fontSpacing * 3;
			}

			return null;
		})
		.filter((layer) => layer !== null); // Filter out null layers (invalid characters)
	return layers;
}
function calculateCharacterWidth(shapeData) {
	let maxWidth = 0;
	if (shapeData && shapeData.length > 0) {
		shapeData.forEach((shape) => {
			if (shape && shape.ks && shape.ks.k && shape.ks.k.v) {
				const vertices = shape.ks.k.v;
				const maxX = Math.max(...vertices.map((vertex) => vertex[0]));
				if (maxX > maxWidth) {
					maxWidth = maxX;
				}
			}
		});
	}
	return maxWidth;
}
function calculateWordWidth(word) {
	let totalWidth = 0;
	word.split('').forEach((char) => {
		const shapeLayer = fontShapes[char];
		if (shapeLayer) {
			totalWidth += calculateCharacterWidth(shapeLayer);
		} else {
			totalWidth += config.fontSpacing * 3;
		}
	});
	return totalWidth;
}

function setConfig(newConfig) {
	Object.assign(config, newConfig);
	cartesianNodes = getNodeCoordinates(config.scale, config.originX, config.originY);
}

export function buildGlyphSticker(input, { animated = true, showCaption = true } = {}) {
	const totalFrames = 180,
		height = 512,
		width = 512;

	let colorIndex = 0,
		hasValidGlyph = false;

	const lines = processInput(input);
	setConfig({ originY: height / 2 + (lines.length == 1 ? config.fontSize : 0) });

	const Palette = [
		[0x43, 0xab, 0xc9],
		[0xda, 0x62, 0x1e],
		[0xd3, 0xb5, 0x3d],
		[0x0d, 0x3d, 0x56],
		[0xad, 0x2a, 0x1a],
		[0xa3, 0xb8, 0x6c],
		[0xc2, 0x57, 0x1a],
		[0x3c, 0x64, 0x78],
		[0xbc, 0xa1, 0x36],
		[0x9a, 0x26, 0x17],
		[0xb5, 0xc6, 0x89],
		[0x14, 0x96, 0xbb],
		[0xf6, 0x4b, 0x44],
		[0xfa, 0xc9, 0x00],
		[0xef, 0x7c, 0x85],
		[0xef, 0xed, 0xd2],
		[0xbc, 0xad, 0xcc],
		[0x00, 0xc1, 0x9f],
		[0x32, 0x92, 0xbc],
		[0xbc, 0xcc, 0xd7],
		[0xfa, 0xb8, 0xc0],
		[0x77, 0x5a, 0xa6],
		[0xfc, 0xed, 0x5a],
		[0x8e, 0xce, 0xc1],
		[0xf6, 0x4b, 0x44],
		[0x32, 0x92, 0xbc],
		[0xef, 0x7c, 0x85],
		[0x8e, 0xce, 0xc1],
		[0xbc, 0xcc, 0xd7],
	];

	const lottieData = {
		v: '5.7.0',
		fr: totalFrames / 3,
		op: totalFrames,
		ip: 0,
		nm: 'GlyphSticker',
		ddd: 0,
		h: height,
		w: width,
		meta: { g: 'https://github.com/ninjaburger/ingress-glyph-sticker-bot' },
		layers: [
			// Glyphs layers will be added here...
			createCalibrationGrid(),
			{
				nm: 'Background',
				ty: 1,
				ip: 0,
				op: totalFrames - 1, // intentionally hide at frame 179 to cause a blink
				st: 0,
				ks: {
					a: { k: [0, 0], a: 0 },
					p: { k: [0, 0], a: 0 },
					s: { k: [100, 100], a: 0 },
					r: { k: 0, a: 0 },
					o: { k: 100, a: 0 },
					sk: { k: 0, a: 0 },
					sa: { k: 0, a: 0 },
				},
				sc: '#000000',
				sh: height,
				sw: width,
			},
		],
	};

	// Sanity check...
	lines.forEach((line, index) => {
		const words = line.split(/[\s\b,]+/).filter((word) => {
			word = word.replace(/[^\x00-\x7F]/g, '');

			if (word.toLowerCase() in glyphs) {
				hasValidGlyph = true;
				return true;
			}

			if (word.length >= 1) {
				let previousChar = '';

				for (let i = 0; i < word.length; i++) {
					const char = word[i];
					if (!/[0-9aA]/.test(char) || char === previousChar) {
						return false;
					}
					previousChar = char;
				}
				hasValidGlyph = true;
				return true;
			}
			return false;
		});

		if (words.length === 0) return;

		const durationPerGlyph = totalFrames / words.length;
		const firstLayer = index === 0;

		words.forEach((word, wordIndex) => {
			const isGlyph = word.toLowerCase() in glyphs;
			const glyphString = isGlyph ? glyphs[word.toLowerCase()] : word;
			const edges = generateGlyphData(glyphString);

			const points = edges.map((edge) => edge.start);
			points.push(edges[edges.length - 1].end);

			const pathShape = createPathShape(points);
			const stWidth = firstLayer ? 8 : +(6 + ((lines.length - index) % 20) * 0.6).toFixed(2);
			const stColor = Palette[colorIndex];

			const startFrame = wordIndex * durationPerGlyph;
			const endFrame = startFrame + durationPerGlyph;

			const glyphLayer = {
				nm: isGlyph ? word : glyphString,
				ty: 4,
				op: endFrame,
				ip: startFrame,
				st: startFrame,
				ks: {
					a: { k: [0, 0], a: 0 },
					p: { k: [0, 0], a: 0 },
					s: { k: [100, 100], a: 0 },
					r: { k: 0, a: 0 },
					o: { k: 100, a: 0 },
					sk: { k: 0, a: 0 },
					sa: { k: 0, a: 0 },
				},
				shapes: [
					pathShape,
					{
						ty: 'st',
						c: { a: 0, k: [+(stColor[0] / 255).toFixed(2), +(stColor[1] / 255).toFixed(2), +(stColor[2] / 255).toFixed(2), 1] },
						o: { a: 0, k: 100 },
						w: { a: 0, k: stWidth },
						lc: 2,
						lj: 2,
						ml: 10,
						bm: 0,
						nm: 'Stroke',
					},
				],
			};

			if (animated) {
				glyphLayer.shapes.push(
					{
						ty: 'tm',
						nm: 'TrimPath',
						ix: 3,
						hd: !animated,
						s: { a: 0, k: 0, ix: 1 },
						e: {
							a: 1,
							k: [
								{ i: { x: [0.3], y: [1] }, o: { x: [0.333], y: [0] }, t: startFrame, s: [0] },
								{ t: endFrame, s: [100] },
							],
							ix: 2,
						},
						o: { a: 0, k: 0, ix: 3 },
						m: 1,
					},
					{
						ty: 'tr',
						o: {
							a: 1,
							k: [
								{ t: startFrame, s: [0] },
								{ t: startFrame + 1, s: [100] },
								{ t: endFrame, s: [100] },
								{ t: endFrame + 1, s: [0] },
							],
							ix: 11,
						},
						a: { k: [0, 0], a: 0 },
						p: { k: [0, 0], a: 0 },
						s: { k: [100, 100], a: 0 },
						r: { k: 0, a: 0 },
						sk: { k: 0, a: 0 },
						sa: { k: 0, a: 0 },
					},
				);
			}
			lottieData.layers.unshift(glyphLayer);
			if (showCaption && lines.length == 1) {
				const textLayer = drawWordLayer(word, (width - (word.length * (20 + 5) - 5)) / 2, 30, startFrame, endFrame);
				lottieData.layers.unshift(...textLayer);
			}
		});
		colorIndex = (colorIndex + 1) % Palette.length;
	});

	if (!hasValidGlyph) return null;

	return lottieData;
}
