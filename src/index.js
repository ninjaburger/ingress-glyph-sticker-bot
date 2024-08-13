//-----------------------------------------------------------------------------
import { jaroWinkler } from '@skyra/jaro-winkler';
import { Buffer } from 'node:buffer';
import pako from 'pako'; //workaround for Cloudflare workers but you can use another lib to gzip stuff
import { TelegramStickerCacheKV } from './modules/TelegramStickerCache.js';
import { glyphs } from './modules/glyphs.mjs';
import { buildGlyphSticker } from './modules/lottie.mjs';
import { getNextGlyphOptions, getRandomSequence, glyphSequencesMap } from './modules/sequences.mjs';
import { answerInlineQuery, deleteMessage, initialize as initTG, sendMessage, sendSticker } from './modules/telegram.js';
//-----------------------------------------------------------------------------
function stickerCacheDecorator(fn) {
	//fn must return a Message with the Sticker (https://core.telegram.org/bots/api#sticker)
	return async function (options = {}, ...args) {
		const { chat_id, text, key_prefix = '', maintenanceChatId = null, animated = true, showCaption = true } = options;
		let cachedFileId = stickerCache.getFileId(chat_id, `${key_prefix}${text}`);
		if (cachedFileId) {
			await fn.apply(this, [chat_id, cachedFileId, ...args]);
			return cachedFileId;
		}
		const tgs = await generateTgs(text, { animated, showCaption });
		const blob = new Blob([tgs], { type: 'application/x-tgsticker' });
		if (tgs !== null) {
			//when not null, it dumps the sticker into private channel to get the file_id but gets stored in the user's cache
			const response = await fn.apply(this, [maintenanceChatId ?? chat_id, blob, ...args]);
			const { sticker: { file_id } = {} } = response || {};
			if (file_id) {
				stickerCache.addQuery(chat_id, `${key_prefix}${text}`, file_id);
				cachedFileId = file_id;
			}
		}
		return cachedFileId;
	};
}
//-----------------------------------------------------------------------------
var maintenanceChatId = '',
	userLimit = 2,
	queryLimit = 5,
	stickerCache = null,
	seqCache = null,
	sendFromCache = stickerCacheDecorator(sendSticker);

const glyphKeys = Object.keys(glyphs);
const gzipData = async (data) => pako.gzip(data);
const similarityMetric = (a, b) => +jaroWinkler(a, b).toFixed(4);
const createOkResponse = (response = { ok: true }) =>
	new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
const cleanse = (text, multiLine = true, jaroWinkler = true) => {
	const processLine = (line) =>
		line
			.split(/(?!')[\p{P}\s]+/u)
			.filter((word) => {
				word = word.replace(/[^\x00-\x7F]/g, '');
				return word.length > 0;
			})
			.map((word) => {
				word = word.trim().toLowerCase();
				if (jaroWinkler && !(word in glyphs)) {
					const closestMatch = glyphKeys.reduce(
						(closest, glyph) => {
							const distance = similarityMetric(word, glyph);
							return distance >= 0.8 && distance > closest.distance ? { glyph, distance } : closest;
						},
						{ glyph: '', distance: 0 },
					);
					if (closestMatch.glyph) word = closestMatch.glyph;
				}
				return word;
			})
			.join(',');
	if (multiLine) {
		return text
			.split('\n')
			.filter((line) => line.trim().length > 0)
			.map(processLine)
			.join('\n');
	} else {
		return processLine(text);
	}
};
//for inline keyboard buttons
const generateButton = (sequence, option) => ({
	text: `${sequence} \u27A1 ${option}`,
	callback_data: `${sequence};${option}`,
});
async function generateTgs(text, options = {}) {
	const { animated = true, showCaption = true } = options;
	const lottieData = buildGlyphSticker(text, { animated, showCaption });
	if (lottieData === null) return lottieData;

	const buffer = new Buffer.from(JSON.stringify(lottieData));
	return await gzipData(buffer);
}
const botCommands = {
	static: async function (chat_id, text, qs = {}) {
		const file_id = await sendFromCache({ chat_id, text, key_prefix: 'static:', animated: false }, qs);
		if (!file_id)
			await sendMessage(
				chat_id,
				`No glyphs found. Provide a glyph or sequence as a parameter. Example: \`/static ${glyphKeys[Math.floor(Math.random() * glyphKeys.length)]}\``,
				qs,
			);
	},

	start: async (...args) => await botCommands.help(...args),
	help: async function (chat_id, _text, qs = {}) {
		let rndGlyph = glyphKeys[Math.floor(Math.random() * glyphKeys.length)];
		await sendMessage(
			chat_id,
			`This bot generates animated stickers of Ingress glyphs. Type any glyph or sequence to get your sticker, or mention/tag the bot in any chat group to get the glyphs or sequence you queried.

To draw a custom glyph, type the sequence of numbered nodes from the calibration grid below, as if sketching a line through them:

\`\`\`
        0
 5              1
    9       6
        a
    8       7
 4              2
        3
\`\`\`

For example, the glyph \`${rndGlyph}\` can also be entered as \`${glyphs[rndGlyph]}\`.

*Available commands*:

\`/help \`- _gets you this message_.
\`/static your-glyphs\` - _generates stickers without animations_.
\`/sequence initial-glyph-or-partial-sequence\` - _explore glyph sequences using inline keyboards_.`,
			qs,
		);
	},

	seq: async (...args) => await botCommands.sequence(...args),
	sequence: async function (chat_id, text, qs = {}) {
		const { sequence, options } = getNextGlyphOptions(text, true /*autocomplete*/);
		if (!sequence)
			return await sendMessage(chat_id, `Glyph sequence not found. Try an existing sequence like \`/sequence ${getRandomSequence()}\``, qs);

		const buttons = options.map((option) => [generateButton(sequence, option)]);
		if (sequence && options.length > 0 && sequence.split(',').length > 1) {
			const pop = sequence.split(',').slice(0, -1).join(',');
			buttons.push([{ text: `\u2B05  Back (${pop})`, callback_data: `${pop};back` }]);
		}
		await sendFromCache({ chat_id, text: sequence }, qs, buttons);
	},
};

async function initializeCache(env) {
	if (!stickerCache) {
		stickerCache = new TelegramStickerCacheKV(userLimit, queryLimit, env);
		await stickerCache.loadCacheFromKV();
	}
	if (!seqCache) {
		const glyphSequence = await env.cache.get('glyphSequence', { type: 'json' });
		seqCache = new Map(glyphSequence);
	}
}

export default {
	async fetch(request, env, ctx) {
		maintenanceChatId = String(env.MAINTENANCE_CHAT_ID);
		userLimit = Number(env.LRU_USERLIMIT);
		queryLimit = Number(env.LRU_QUERYLIMIT);
		initTG(String(env.TELEGRAM_BOT_TOKEN));
		await initializeCache(env);

		const payload = await request.json();

		try {
			if ('message' in payload) {
				const {
					message: {
						message_id,
						chat: { id: chat_id },
						text,
					},
				} = payload;

				if (typeof text !== 'string') return createOkResponse();

				const qs = { chat_id, reply_to_message_id: message_id, parse_mode: 'Markdown' };
				//process bot commands (if any)
				let m;
				if ((m = /^\/([^ \n\r\v\xA0\/@]+)(?:@[^ \n\r\v\xA0\/]*)?[\s\xA0]?([\s\S]*)/.exec(text)) !== null) {
					const function_handler = m[1].toLowerCase();
					if (typeof botCommands[function_handler] === 'function') {
						await botCommands[function_handler](chat_id, cleanse(String(m[2])), qs);
						ctx.waitUntil(stickerCache.saveCacheToKV());
					}
					return createOkResponse();
				}
				//process user's input and build sticker
				const cleansed = cleanse(text);
				await sendFromCache({ chat_id, text: cleansed }, qs);
				ctx.waitUntil(stickerCache.saveCacheToKV());
			} else if ('inline_query' in payload) {
				const {
					inline_query: {
						id: queryId,
						query: queryText,
						from: { id: fromId },
					},
				} = payload;

				if (String(queryText).endsWith('.')) {
					const cleansed = cleanse(queryText.slice(0, -1));
					//-----------------------------------------------------------------------------
					//Find glyph-sequence similarities
					let glyphSeqMap = new Map();
					for (const [key, sequences] of glyphSequencesMap.entries()) {
						for (const sequence of sequences) {
							const sequenceStr = `${key},${sequence.join(',')}`;
							let distance = similarityMetric(cleansed, sequenceStr);
							distance >= 0.7 && glyphSeqMap.set(sequenceStr, distance);
						}
					}
					//-----------------------------------------------------------------------------
					// dump sticker into a private channel to get its file_id
					let results = [];
					const file_id = await sendFromCache({ chat_id: fromId, maintenanceChatId, text: cleansed }, { disable_notification: true });
					if (file_id) {
						results.push({
							title: cleansed,
							description: 'Custom glyph sequence',
							file_id,
						});
					}
					const levelMap = { 2: 'L2', 3: 'L3 / L5', 4: 'L6 / L7', 5: 'L8' };
					results.push(
						...[...glyphSeqMap.entries()]
							.sort((a, b) => b[1] - a[1]) //score desc
							.slice(0, 5)
							.filter(([key, _]) => seqCache.has(key))
							.map(([key, _]) => {
								const glyphsPerSequence = String(key).split(',').length;
								let portalLevel = levelMap[glyphsPerSequence] || '';
								return { title: key, description: portalLevel, file_id: seqCache.get(key), glyphs: key };
							}),
					);
					const inlineQueryResults = results.map(({ title, description, file_id: document_file_id }, index) => ({
						type: 'document',
						id: String(index),
						title,
						description,
						document_file_id,
					}));
					await answerInlineQuery(queryId, inlineQueryResults);
					ctx.waitUntil(stickerCache.saveCacheToKV());
				}
			} else if ('callback_query' in payload) {
				const {
					callback_query: {
						message: {
							chat: { id: chat_id },
							message_id: message_id,
						},
						data,
					},
				} = payload;

				const [input, action] = data.split(';');
				const isBackAction = action === 'back';
				const sequenceInput = isBackAction ? input.split(',') : [action];
				const newSequence = isBackAction ? sequenceInput.slice(0, -1) : [input, action];

				//fallback
				if (newSequence.length == 0 && isBackAction) newSequence.push(input);

				const { sequence, options } = getNextGlyphOptions(newSequence.join(','), true);
				const buttons = options.map((option) => [generateButton(sequence, option.replace(/^,+/, ''))]);
				if (sequence && newSequence.length > 1) {
					const prev = newSequence.slice(0, 1).join(',');
					buttons.push([{ text: `\u2B05 Back (${prev}) `, callback_data: `${prev};back` }]);
				}
				await Promise.all([sendFromCache({ chat_id, text: sequence }, undefined, buttons), deleteMessage(chat_id, message_id)]);
			}
		} catch (error) {
			console.error('Error processing request:', error);
			return createOkResponse('Error processing request');
		}
		return createOkResponse();
	},
};
