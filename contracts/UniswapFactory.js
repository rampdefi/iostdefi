const assert = function (condition, memo) {
	if (!condition) {
		if (memo) {
			throw memo;
		} else {
			throw '断言错误';
		}
	}
};

const TOKEN_COUNT = 'token_count';
const TOKEN_TO_EXCHANGE = 'token_to_exchange';
const EXCHANGE_TO_TOKEN = 'exchange_to_token';
const ID_TO_TOKEN = 'id_to_token';

class UniswapFactory {
	init() {}

	can_update(data) {
		return blockchain.requireAuth(blockchain.contractOwner(), 'active');
	}

	registerExchange(exchange, token) {
		assert(token !== '', 'INVALID_TOKEN');
		assert(storage.mapGet(TOKEN_TO_EXCHANGE, token) === null, 'EXCHANGE_OF_TOKEN_EXIST');
		const factoryName = blockchain.call(exchange, 'factorySymbol', [])[0];
		assert(factoryName === blockchain.contractName(), 'EXCHANGE_OF_FACTORY_NOT_MATCH');
		storage.mapPut(TOKEN_TO_EXCHANGE, token, exchange);
		storage.mapPut(EXCHANGE_TO_TOKEN, exchange, token);
		const token_id = JSON.stringify(storage.get(TOKEN_COUNT) * 1 + 1);
		storage.put(TOKEN_COUNT, token_id);
		storage.mapPut(ID_TO_TOKEN, token_id, token);
		blockchain.event(
			JSON.stringify({
				token: token,
				exchange: exchange,
			})
		);
		return exchange;
	}

	getExchange(token) {
		return storage.mapGet(TOKEN_TO_EXCHANGE, token);
	}

	getToken(exchange) {
		return storage.mapGet(EXCHANGE_TO_TOKEN, exchange);
	}

	getTokenWithId(token_id) {
		return storage.mapGet(ID_TO_TOKEN, token_id);
	}
}

module.exports = UniswapFactory;
