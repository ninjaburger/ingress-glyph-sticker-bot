class Node {
	constructor(chatId) {
		this.chatId = chatId;
		this.prev = null;
		this.next = null;
	}
}
class LRUUsers {
	constructor(limit) {
		this.limit = limit;
		this.map = new Map(); // Map<chatId, Node>
		this.head = null; // Most recent user
		this.tail = null; // Least recent user
	}

	moveToFront(node) {
		if (node === this.head) return;

		if (node.prev) node.prev.next = node.next;
		if (node.next) node.next.prev = node.prev;

		if (node === this.tail) {
			this.tail = node.prev;
		}

		node.prev = null;
		node.next = this.head;
		if (this.head) this.head.prev = node;
		this.head = node;
	}

	addUser(chatId) {
		let evictedChatId = null;
		let node;

		if (this.map.has(chatId)) {
			node = this.map.get(chatId);
			this.moveToFront(node);
		} else {
			if (this.map.size >= this.limit) {
				evictedChatId = this.removeTail();
			}

			node = new Node(chatId);
			this.map.set(chatId, node);
			node.next = this.head;
			if (this.head) this.head.prev = node;
			this.head = node;
			if (!this.tail) this.tail = node;
		}
		return evictedChatId;
	}

	removeTail() {
		if (!this.tail) return null;

		const removedNode = this.tail;
		this.map.delete(removedNode.chatId);

		if (this.tail.prev) {
			this.tail.prev.next = null;
		}
		this.tail = this.tail.prev;

		if (!this.tail) {
			this.head = null;
		}
		return removedNode.chatId;
	}

	getUsersInOrder() {
		let users = [];
		let current = this.head;
		while (current) {
			users.push(current.chatId);
			current = current.next;
		}
		return users;
	}
}

/**
 * Caches the `file_id` of Telegram stickers for frequent users and their glyph queries.
 *
 * Quickly serves recently requested stickers by using cached data instead of generating new stickers each time.
 */
export class TelegramStickerCache {
	/**
	 * Creates a new instance of TelegramStickerCache.
	 *
	 * @param {number} userLimit - The maximum number of users to keep track of in the cache.
	 * @param {number} queryLimit - The maximum number of queries to store per user.
	 */
	constructor(userLimit, queryLimit) {
		/**
		 * A map storing queries and their corresponding file IDs for each user.
		 * @type {Map<number, Map<string, string>>}
		 */
		this.userQueries = new Map();
		/**
		 * An LRU cache to manage the most recent users.
		 *
		 * Once the `userLimit` is reached, the least recently used user is evicted,
		 * and their queries are removed from the cache.
		 *
		 * @type {LRUUsers}
		 */
		this.recentUsers = new LRUUsers(userLimit);
		/**
		 * The maximum number of queries to store per user.
		 * @type {number}
		 */
		this.queryLimit = queryLimit;
	}
	/**
	 * Adds a query and its corresponding sticker `file_id` to the cache for a user.
	 *
	 * @param {number} chatId - The user's chat ID.
	 * @param {string} criteria - The query criteria (glyph sequence).
	 * @param {string} file_id - The `file_id` of the Telegram sticker.
	 */
	addQuery(chatId, criteria, file_id) {
		if (!this.userQueries.has(chatId)) {
			this.userQueries.set(chatId, new Map());
		}

		let evictedChatId = null,
			removedCriteria = null;

		const queriesMap = this.userQueries.get(chatId);
		if (queriesMap.size >= this.queryLimit) {
			const oldestCriteria = queriesMap.keys().next().value;
			queriesMap.delete(oldestCriteria);
			removedCriteria = oldestCriteria;
		}

		queriesMap.set(criteria, file_id);

		evictedChatId = this.recentUsers.addUser(chatId);
		if (evictedChatId) {
			this.removeUser(evictedChatId);
		}
		return { evictedChatId, removedCriteria };
	}
	/**
	 * Removes all cached queries for a user.
	 *
	 * @param {number} chatId - The user's chat ID.
	 */
	removeUser(chatId) {
		this.userQueries.delete(chatId);
	}
	/**
	 * Retrieves the `file_id` for a user's query if it exists in the cache.
	 *
	 * @param {number} chatId - The user's chat ID.
	 * @param {string} criteria - The query criteria (glyph sequence).
	 * @returns {string|null} The `file_id` of the sticker, or null if not found.
	 */
	getFileId(chatId, criteria) {
		const queriesMap = this.userQueries.get(chatId);
		if (queriesMap) {
			return queriesMap.get(criteria) || null;
		}
		return null;
	}
	/**
	 * Retrieves all queries and their `file_id`s for a user.
	 *
	 * @param {number} chatId - The user's chat ID.
	 * @returns {Map<string, string>} A map of queries and `file_id`s for the user.
	 */
	getUserQueries(chatId) {
		return this.userQueries.get(chatId) || new Map();
	}
}

export class TelegramStickerCacheKV extends TelegramStickerCache {
	constructor(userLimit, queryLimit, env) {
		super(userLimit, queryLimit);
		this.env = env;
	}
	async loadCacheFromKV() {
		try {
			const storedCache = await this.env.cache.get('stickerCache', { type: 'json' });
			if (storedCache) {
				this.userQueries = new Map(storedCache.userQueries.map(([key, value]) => [key, new Map(value)]));
				this.recentUsers = new LRUUsers(this.userLimit);
				storedCache.recentUsers.forEach((user) => this.recentUsers.addUser(user));
			} else {
				await this.saveCacheToKV();
			}
		} catch (error) {
			console.error('Error loading cache from KV:', error);
		}
	}

	async saveCacheToKV() {
		try {
			const cacheData = {
				userQueries: [...this.userQueries].map(([key, value]) => [key, [...value]]),
				recentUsers: this.recentUsers.getUsersInOrder(),
			};
			await this.env.cache.put('stickerCache', JSON.stringify(cacheData));
		} catch (error) {
			// Log any errors that occur during the put operation
			console.error('Error saving cache to KV:', error);
		}
	}
}
