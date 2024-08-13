// Telegram API interaction — for what it's worth I don't need an entire implementation :D
let token;
let baseUrl;

// Initialize the module with the token
export function initialize(telegramToken) {
	token = telegramToken;
	baseUrl = `https://api.telegram.org/bot${token}/`;
}

// Base function to make API requests
async function apiRequest(endpoint, options) {
	const response = await fetch(`${baseUrl}${endpoint}`, options);
	const result = await response.json();
	if (!result.ok) {
		throw new Error(`API request failed: ${result.description}`);
	}
	return result;
}

export async function sendMessage(chatId, text, queryParams = {}) {
	let form = new FormData();
	form.append('chat_id', chatId);
	form.append('text', text);

	const queryString = new URLSearchParams(queryParams).toString();
	return apiRequest(`sendMessage?${queryString}`, {
		method: 'POST',
		body: form,
	});
}
export async function sendSticker(chatId, sticker, queryParams = {}, inlineKeyboard = null) {
	const form = new FormData();
	form.append('chat_id', chatId);

	if (typeof sticker === 'string') {
		form.append('sticker', sticker);
	} else {
		form.append('sticker', sticker, 'sticker.tgs');
	}

	// Add inline keyboard if provided
	if (inlineKeyboard) {
		form.append('reply_markup', JSON.stringify({ inline_keyboard: inlineKeyboard }));
	}

	// Construct the query string
	const queryString = new URLSearchParams(queryParams).toString();
	return apiRequest(`sendSticker?${queryString}`, {
		method: 'POST',
		body: form,
	}).then((result) => result.result); // Return the full result object (Message)
}
export async function answerInlineQuery(queryId, results) {
	return apiRequest('answerInlineQuery', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			inline_query_id: queryId,
			results: results,
		}),
	});
}
export async function deleteMessage(chat_id, message_id) {
	return apiRequest('deleteMessage', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id, message_id }),
	});
}
