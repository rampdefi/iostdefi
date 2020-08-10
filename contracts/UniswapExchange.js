const assert = function (condition, memo) {
	if (!condition) {
		if (memo) throw memo;
		else throw 'ASSERT_ERROR';
	}
};

const toFixedNum = function (str) {
	return (str * 1).toFixed(8) * 1;
};

const toTime = function (time) {
	return time * 10 ** 6;
};

const SafeMath = {
	mul: (a = 0, b) => {
		if (a == 0) {
			return 0;
		}

		const c = toFixedNum(a * b);
		assert(c < Number.MAX_VALUE, 'SafeMath#mul: OVERFLOW');

		return c;
	},
	div: (a, b) => {
		assert(b > 0, 'SafeMath#div: DIVISION_BY_ZERO');
		const c = toFixedNum(a / b);
		return c;
	},
	sub: (a, b) => {
		assert(b <= a, 'SafeMath#sub: UNDERFLOW');
		const c = toFixedNum(toFixedNum(a) - toFixedNum(b));
		return c;
	},
	add: (a = 0, b) => {
		const c = toFixedNum(toFixedNum(a) + toFixedNum(b));
		assert(c < Number.MAX_VALUE, 'SafeMath#add: OVERFLOW');
		return c;
	},
	mod: (a, b) => {
		assert(b != 0, 'SafeMath#mod: DIVISION_BY_ZERO');
		return a % b;
	},
};

// 工厂名
const FACTORY = 'factory';
// 代币名
const TOKEN = 'token';
// 总流通量
const TOTALSUPPLY = 'totalSupply';
// 余额
const BALANNCE = 'balance';

/*
	balance
		iost
		token
		totalSupply
		singleSupply
* * */

/*
	TODO 精度 8 位
 */
class UniswapExchange {
	init() {}

	// TODO 后续更新合约需去掉
	can_update(data) {
		return blockchain.requireAuth(blockchain.contractOwner(), 'active');
	}

	setup(token, factory) {
		const _factory = storage.get(FACTORY);
		const _token = storage.get(TOKEN);
		assert(_factory === null && _token === null && !!token, 'INVALID_TOKEN_OR_FACTORY');

		storage.put(FACTORY, factory);
		storage.put(TOKEN, token);
		storage.put(
			BALANNCE,
			JSON.stringify({
				iost: 0,
				token: 0,
				singleSupply: {},
				totalSupply: 0,
			})
		);
	}

	/*
		TODO @return Amount of Iost or Tokens bought
	*/
	getInputPrice(_inputAmount, _inputReserve, _outputReserve) {
		const inputAmount = _inputAmount * 1;
		const inputReserve = _inputReserve * 1;
		const outputReserve = _outputReserve * 1;
		assert(inputReserve > 0 && outputReserve > 0, 'INVALID_VALUE');
		const inputAmountWithFee = SafeMath.mul(inputAmount, 997);
		const numerator = SafeMath.mul(inputAmountWithFee, outputReserve);
		const denominator = SafeMath.add(SafeMath.mul(inputReserve, 1000), inputAmountWithFee);
		return toFixedNum(numerator / denominator);
	}

	/*
		TODO @return Amount of IOST or Tokens sold.
	 */
	getOutputPrice(_outputAmount, _inputReserve, _outputReserve) {
		const outputAmount = _outputAmount * 1;
		const inputReserve = _inputReserve * 1;
		const outputReserve = _outputReserve * 1;
		assert(outputReserve > 0 && inputReserve > 0, 'INVALID_VALUE');
		const numerator = SafeMath.mul(SafeMath.mul(inputReserve, outputAmount), 1000);
		const denominator = SafeMath.mul(SafeMath.sub(outputReserve, outputAmount), 997);
		return toFixedNum(numerator / denominator);
	}

	// TODO 实际的状态变量是需要和行为一致的，不然合约执行是会出现问题的
	_iostToTokenInput(_iostSold, _minTokens, _deadline, buyer, recipient) {
		const iostSold = toFixedNum(_iostSold);
		const minTokens = toFixedNum(_minTokens);
		const deadline = _deadline * 1;

		assert(toTime(deadline) >= tx.time && iostSold > 0 && minTokens > 0, 'INVALID_ARGUMENT');

		this._transfer(true, tx.publisher, this._getSelf(), iostSold + '', 'IostToTokenInput#recive ' + iostSold + ' iost');

		const balance = this._getBalance();
		let iostBalance = balance[0];
		let tokenBalance = balance[1];
		const tokenReserve = tokenBalance;
		const iostReserve = iostBalance - iostSold;
		const tokensBought = this.getInputPrice(iostSold, iostReserve, tokenReserve);
		assert(tokensBought >= minTokens, 'INVALID_TOKEN_BOUGHT');
		this._transfer(
			false,
			this._getSelf(),
			recipient,
			tokensBought + '',
			'IostToTokenInput#send ' + tokensBought + ' ' + storage.get(TOKEN)
		);
		blockchain.event(
			JSON.stringify({
				buyer: buyer,
				iostSold: _iostSold,
				tokensBought: tokensBought,
			})
		);
		return tokensBought;
	}

	iostToTokenSwapInput(iostSold, minTokens, deadline) {
		return this._iostToTokenInput(iostSold, minTokens, deadline, tx.publisher, tx.publisher);
	}

	iostToTokenTransferInput(iostSold, minTokens, deadline, recipient) {
		assert(recipient != this._getSelf() && !!recipient);
		return this._iostToTokenInput(iostSold, minTokens, deadline, tx.publisher, recipient);
	}

	_iostToTokenOutput(_tokensBought, _maxIost, _deadline, buyer, recipient) {
		const tokensBought = toFixedNum(_tokensBought);
		const maxIost = toFixedNum(_maxIost);
		const deadline = _deadline * 1;
		assert(toTime(deadline) >= tx.time && tokensBought > 0 && maxIost > 0);

		this._transfer(true, tx.publisher, this._getSelf(), maxIost + '', 'IostToTokenOutput#recive -> iost ' + maxIost);

		const balance = this._getBalance();
		let iostBalance = balance[0];
		let tokenBalance = balance[1];
		const tokenReserve = tokenBalance;
		const iostSold = this.getOutputPrice(tokensBought, SafeMath.sub(iostBalance, maxIost), tokenReserve);
		const iostRefund = SafeMath.sub(maxIost, iostSold);
		// 退款、还款
		if (iostRefund > 0) {
			this._transfer(true, this._getSelf(), buyer, iostRefund + '', 'IostToTokenOutput#refund ' + iostRefund + 'iost');
		}
		this._transfer(false, this._getSelf(), recipient, tokensBought + '', 'IostToTokenOutput#send token' + tokensBought);
		blockchain.event(
			JSON.stringify({
				buyer: buyer,
				iostSold: iostSold,
				tokensBought: tokensBought,
			})
		);
		return iostSold;
	}

	iostToTokenSwapOutput(tokensBought, iostSold, deadline) {
		return this._iostToTokenOutput(tokensBought, iostSold, deadline, tx.publisher, tx.publisher);
	}

	iostToTokenTransferOutput(tokensBought, iostSold, deadline, recipient) {
		assert(recipient !== blockchain.contractName() && !!recipient);
		return this._iostToTokenOutput(tokensBought, iostSold, deadline, tx.publisher, recipient);
	}

	_tokenToIostInput(_tokenSold, _minIost, _deadline, buyer, recipient) {
		const tokensSold = toFixedNum(_tokenSold);
		const minIost = toFixedNum(_minIost);
		const deadline = _deadline * 1;
		assert(toTime(deadline) >= tx.time && tokensSold > 0 && minIost > 0);

		const balance = this._getBalance();
		let iostBalance = balance[0];
		let tokenBalance = balance[1];

		const tokenReserve = tokenBalance;
		const iostBought = this.getInputPrice(tokensSold, tokenReserve, iostBalance);
		assert(iostBought >= minIost);

		this._transfer(true, this._getSelf(), recipient, iostBought + '', 'TokenToIostInput#send iost' + iostBought);

		this._transfer(false, buyer, this._getSelf(), tokensSold + '', 'TokenToIostInput#recive token' + tokensSold);

		blockchain.event(
			JSON.stringify({
				buyer: buyer,
				tokensSold: tokensSold,
				iostBought: iostBought,
			})
		);
		return iostBought;
	}

	tokenToIostSwapInput(tokensSold, minIost, deadline) {
		return this._tokenToIostInput(tokensSold, minIost, deadline, tx.publisher, tx.publisher);
	}

	tokenToIostTransferInput(tokensSold, minIost, deadline, recipient) {
		assert(recipient != this._getSelf() && !!recipient);
		return this._tokenToIostInput(tokensSold, minIost, deadline, tx.publisher, recipient);
	}

	/*
		TODO Main
	 */
	_tokenToIostOutput(_iostBought, _maxTokens, _deadline, buyer, recipient) {
		const iostBought = toFixedNum(_iostBought);
		const maxTokens = toFixedNum(_maxTokens);
		const deadline = _deadline * 1;
		assert(toTime(deadline) >= tx.time && iostBought > 0);

		const balance = this._getBalance();
		let iostBalance = balance[0];
		let tokenBalance = balance[1];

		const tokenReserve = tokenBalance;
		const tokensSold = this.getOutputPrice(iostBought, tokenReserve, iostBalance);
		assert(maxTokens >= tokensSold);

		this._transfer(true, this._getSelf(), recipient, iostBought + '', 'TokenToIostOutput#send ' + iostBought);

		this._transfer(false, buyer, this._getSelf(), tokensSold + '', 'TokenToIostOutput#receive ' + tokensSold);

		blockchain.event(
			JSON.stringify({
				buyer: buyer,
				tokensSold: tokensSold,
				iostBought: iostBought,
			})
		);
		return tokensSold;
	}

	tokenToIostSwapOutput(iostBought, maxTokens, deadline) {
		return this._tokenToIostOutput(iostBought, maxTokens, deadline, tx.publisher, tx.publisher);
	}

	tokenToIostTransferOutput(iostBought, maxTokens, deadline, recipient) {
		assert(recipient != this._getSelf() && !!recipient);
		return this._tokenToIostOutput(iostBought, maxTokens, deadline, tx.publisher, recipient);
	}

	/*
		TODO 待调试，因为需要2份合约
	 */
	_tokenToTokenInput(_tokenSold, _minTokensBought, _minIostBought, _deadline, buyer, recipient, exchangeName) {
		const tokensSold = toFixedNum(_tokenSold);
		const minTokensBought = toFixedNum(_minIostBought);
		const minIostBought = toFixedNum(_minIostBought);
		const deadline = _deadline * 1;
		assert(toTime(deadline) >= tx.time && tokensSold > 0 && minTokensBought > 0 && minIostBought > 0);
		assert(exchangeName !== this._getSelf() && !!exchangeName);

		const balance = this._getBalance();
		let iostBalance = balance[0];
		let tokenBalance = balance[1];

		const tokenReserve = tokenBalance;
		const iostBought = this.getInputPrice(tokensSold, tokenReserve, iostBalance);

		assert(iostBought >= minIostBought);

		this._transfer(false, buyer, this._getSelf(), tokensSold + '', '');

		this._transfer(true, this._getSelf(), buyer, iostBought + '', '');

		const tokensBought = blockchain.call(exchangeName, 'iostToTokenTransferInput', [
			iostBought + '',
			minTokensBought + '',
			deadline + '',
			recipient,
		])[0];

		blockchain.event(
			JSON.stringify({
				buyer: buyer,
				tokensSold: tokensSold,
				iostBought: iostBought,
			})
		);
		return tokensBought;
	}

	tokenToTokenSwapInput(tokensSold, minTokensBought, minIostBought, deadline, token) {
		const exchangeName = this.getExchangeName(token);
		return this._tokenToTokenInput(
			tokensSold,
			minTokensBought,
			minIostBought,
			deadline,
			tx.publisher,
			tx.publisher,
			exchangeName
		);
	}

	tokenToTokenTransferInput(tokensSold, minTokensBought, minIostBought, deadline, recipient, token) {
		const exchangeName = this.getExchangeName(token);
		return this._tokenToTokenInput(
			tokensSold,
			minTokensBought,
			minIostBought,
			deadline,
			tx.publisher,
			recipient,
			exchangeName
		);
	}

	/*
		TODO 待调试
	* */
	_tokenToTokenOutput(_tokensBought, _maxTokensSold, _maxIostSold, _deadline, buyer, recipient, exchangeName) {
		const tokensBought = toFixedNum(_tokensBought);
		const maxTokensSold = toFixedNum(_maxTokensSold);
		const maxIostSold = toFixedNum(_maxIostSold);
		const deadline = _deadline * 1;
		assert(toTime(deadline) > tx.time, 'TIME_OUT');
		assert(tokensBought > 0, 'INVALID_TOKEN_VALUE');
		assert(maxIostSold > 0, 'INVALID_ISOT_VALUE');
		assert(!!exchangeName && exchangeName !== this._getSelf(), 'INVALID_EXCHANGE_NAME');

		// TOdo 问题大大的
		const iostBought = blockchain.call(exchangeName, 'getIostToTokenOutputPrice', [tokensBought + ''])[0];

		const balance = this._getBalance();
		let iostBalance = balance[0];
		let tokenBalance = balance[1];

		const tokenReserve = tokenBalance;
		const tokensSold = this.getOutputPrice(iostBought, tokenReserve, iostBalance);

		assert(maxTokensSold >= tokensSold && maxIostSold >= iostBought, 'BIGGER_VALUE');

		this._transfer(false, buyer, this._getSelf(), tokensSold + '', 'TokenToTokenOutput#recive token ' + tokensSold);

		this._transfer(true, this._getSelf(), buyer, iostBought + '', 'TokenToTokenOutput#send iost ' + iostBought);

		const iostSold = blockchain.call(exchangeName, 'iostToTokenTransferOutput', [
			tokensBought.toFixed(8),
			iostBought,
			_deadline,
			recipient,
		])[0];

		blockchain.event(
			JSON.stringify({
				buyer: buyer,
				tokensSold: tokensSold,
				iostBought: iostBought,
			})
		);
		return tokensSold;
	}

	tokenToTokenSwapOutput(tokensBought, maxTokensSold, maxIostSold, deadline, token) {
		const exchangeName = this.getExchangeName(token);
		return this._tokenToTokenOutput(
			tokensBought,
			maxTokensSold,
			maxIostSold,
			deadline,
			tx.publisher,
			tx.publisher,
			exchangeName
		);
	}

	tokenToTokenTransferOutput(tokensBought, maxTokensSold, maxIostSold, deadline, recipient, token) {
		const exchangeName = this.getExchangeName(token);
		return this._tokenToTokenOutput(
			tokensBought,
			maxTokensSold,
			maxIostSold,
			deadline,
			tx.publisher,
			recipient,
			exchangeName
		);
	}

	tokenToExchangeSwapInput(tokensSold, minTokensBought, minIostBought, deadline, exchangeName) {
		return this._tokenToTokenInput(
			tokensSold,
			minTokensBought,
			minIostBought,
			deadline,
			tx.publisher,
			tx.publisher,
			exchangeName
		);
	}

	tokenToExchangeTransferInput(tokensSold, minTokensBought, minIostBought, deadline, recipient, exchangeName) {
		assert(recipient !== this._getSelf());
		return this._tokenToTokenInput(tokensSold, minTokensBought, minIostBought, deadline, recipient, exchangeName);
	}

	tokenToExchangeSwapOutput(tokensBought, maxTokensSold, maxIostSold, deadline, exchangeName) {
		return this._tokenToTokenOutput(
			tokensBought,
			maxTokensSold,
			maxIostSold,
			deadline,
			tx.publisher,
			tx.publisher,
			exchangeName
		);
	}

	tokenToExchangeTransferOutput(tokensBought, maxTokensSold, maxIostSold, deadline, recipient, exchangeName) {
		assert(recipient !== this._getSelf());
		return this._tokenToTokenOutput(
			tokensBought,
			maxTokensSold,
			maxIostSold,
			deadline,
			tx.publisher,
			recipient,
			exchangeName
		);
	}

	getIostToTokenInputPrice(_iostSold) {
		const iostSold = _iostSold * 1;
		assert(iostSold > 0);

		const balance = this._getBalance();
		let iostBalance = balance[0];
		let tokenBalance = balance[1];

		const tokenReserve = tokenBalance;
		return this.getInputPrice(iostSold, iostBalance, tokenReserve);
	}

	getIostToTokenOutputPrice(_tokensBought) {
		const tokenBought = _tokensBought * 1;
		assert(_tokensBought > 0);

		const balance = this._getBalance();
		let iostBalance = balance[0];
		let tokenBalance = balance[1];

		const tokenReserve = tokenBalance;
		const iostSold = this.getOutputPrice(tokenBought, iostBalance, tokenReserve);
		return iostSold;
	}

	getTokenToIostInputPrice(_tokensSold) {
		const tokensSold = _tokensSold * 1;
		assert(tokensSold > 0);

		const balance = this._getBalance();
		let iostBalance = balance[0];
		let tokenBalance = balance[1];

		const tokenReserve = tokenBalance;
		const iostBought = this.getInputPrice(tokensSold, tokenReserve, iostBalance);
		return iostBought;
	}

	getTokenToIostOutputPrice(_iostBought) {
		const balance = JSON.parse(storage.get(BALANNCE));

		if (!balance) {
			storage.put(
				BALANNCE,
				JSON.stringify({
					iost: 0,
					token: 0,
					singleSupply: {},
					totalSupply: 0,
				})
			);
			return;
		}

		balance[TOTALSUPPLY] = 0;
		balance.singleSupply = {};
		storage.put(BALANNCE, JSON.stringify(balance));
		this._transfer(true, this._getSelf(), tx.publisher, balance.iost + '', '');
		this._transfer(false, this._getSelf(), tx.publisher, balance.token + '', '');
		return;

		// const iostBought = _iostBought * 1;
		// assert(iostBought > 0);

		// const balance = this._getBalance();
		// let iostBalance = balance[0];
		// let tokenBalance = balance[1];

		// const tokenReserve = tokenBalance;
		// return this.getOutputPrice(iostBought, tokenReserve, iostBalance);
	}

	tokenSymbol() {
		return storage.get(TOKEN);
	}

	factorySymbol() {
		return storage.get(FACTORY);
	}

	getExchangeName(token) {
		return blockchain.call(this.factorySymbol(), 'getExchange', [token])[0];
	}

	/*
		TODO 增加资金池
	 */
	addLiquidity(_iostSold, _minLiquidity, _maxTokens, _deadline) {
		const iostSold = toFixedNum(_iostSold);
		const minLiquidity = toFixedNum(_minLiquidity);
		const maxTokens = toFixedNum(_maxTokens);
		const deadline = _deadline * 1;

		assert(
			toTime(deadline) > tx.time && maxTokens > 0 && iostSold > 0,
			'UniswapExchange#addLiquidity: INVALID_ARGUMENT'
		);

		this._transfer(true, tx.publisher, this._getSelf(), iostSold + '', 'AddLiquidity#recive iost' + iostSold);

		const balance = JSON.parse(storage.get(BALANNCE));
		const totalLiquidity = balance[TOTALSUPPLY];
		const myLiquidity = balance.singleSupply[tx.publisher] ? balance.singleSupply[tx.publisher] : 0;
		const iostBalance = balance.iost;
		const tokenBalance = balance.token;

		if (totalLiquidity > 0) {
			assert(minLiquidity > 0);
			const iostReserve = iostBalance - iostSold;
			const tokenReserve = tokenBalance;
			// output price
			const tokenAmount = SafeMath.div(SafeMath.mul(iostSold, tokenReserve), iostReserve);
			const liquidityMinted = SafeMath.div(SafeMath.mul(totalLiquidity, iostSold), iostReserve);

			assert(
				maxTokens >= tokenAmount && liquidityMinted >= minLiquidity,
				'liquidity less than mimLiquidity,cant add it'
			);

			balance[TOTALSUPPLY] = totalLiquidity + liquidityMinted;
			balance.singleSupply[tx.publisher] = myLiquidity + liquidityMinted;

			storage.put(BALANNCE, JSON.stringify(balance));

			this._transfer(
				false,
				tx.publisher,
				this._getSelf(),
				tokenAmount + '',
				'addLiquidity#recive token ' + tokenAmount
			);

			blockchain.event(
				JSON.stringify({
					adder: tx.publisher,
					tokenAmount: tokenAmount,
					liquidityMinted: liquidityMinted,
				})
			);
			return liquidityMinted;
		} else {
			/*  最初的流通量就是当前合约 iost 的总量  */
			assert(this.factorySymbol() !== null && this.tokenSymbol() !== null && iostSold >= 1, 'INVALID_VALUE');
			assert(this.getExchangeName(this.tokenSymbol()) === this._getSelf(), '工厂获取交易地址异常');

			const tokenAmount = maxTokens;
			const initialLiquidity = iostBalance;
			balance[TOTALSUPPLY] = initialLiquidity;
			balance.singleSupply[tx.publisher] = initialLiquidity;

			storage.put(BALANNCE, JSON.stringify(balance));

			this._transfer(false, tx.publisher, this._getSelf(), tokenAmount + '', '');

			blockchain.event(
				JSON.stringify({
					sender: tx.publisher,
					amount: iostSold,
					tokenAmount: tokenAmount,
				})
			);
			return initialLiquidity;
		}
	}

	removeLiquidity(_amount, _minIost, _minTokens, _deadline) {
		const amount = toFixedNum(_amount);
		const minIost = toFixedNum(_minIost);
		const minTokens = toFixedNum(_minTokens);
		const deadline = toFixedNum(_deadline);

		assert(amount > 0 && toTime(deadline) > tx.time && minIost > 0 && minTokens > 0);

		const balance = JSON.parse(storage.get(BALANNCE));
		const totalLiquidity = balance[TOTALSUPPLY];
		assert(totalLiquidity > 0, 'LIQUIDITY_NOT_ENOUGH');
		const myLiquidity = balance.singleSupply[tx.publisher];
		assert(myLiquidity >= amount, 'YOUR_LIQUIDITY_NOT_ENOUGH');

		const iostBalance = balance.iost;
		const tokenBalance = balance.tokenn;

		const tokenReserve = tokenBalances;
		const iostAmount = toFixedNum(SafeMath.mul(amount, iostBalance) / totalLiquidity);
		const tokenAmount = toFixedNum(SafeMath.mul(tokenReserve, amount) / totalLiquidity);
		assert(iostAmount >= minIost && tokenAmount >= minTokens, 'GET_LIQUIDITY_IS_BIGGER_CANT_DO');

		balance.singleSupply[tx.publisher] = SafeMath.sub(myLiquidity, amount);
		balance[TOTALSUPPLY] = SafeMath.sub(totalLiquidity, amount);

		storage.put(BALANNCE, JONS.stringify(balance));

		this._transfer(true, this._getSelf(), tx.publisher, iostAmount + '', '');
		this._transfer(false, this._getSelf(), tx.publisher, tokenAmount + '', '');

		blockchain.event(
			JSON.stringify({
				publisher: tx.publisher,
				iostAmount: iostAmount,
				tokenAmount: tokenAmount,
			})
		);
		return [iostAmount, tokenAmount];
	}

	_getSelf() {
		return blockchain.contractName();
	}

	// return number
	_getBalance() {
		const balance = JSON.parse(storage.get(BALANNCE));
		return [balance.iost, balance.token];
	}
	_setBalance(iost, token) {
		const balbance = JSON.parse(storage.get(BALANNCE));
		balbance.iost = iost;
		balbance.token = token;
		storage.put(JSON.stringify(balbance));
	}
	// TODO 异常待处理
	_transfer(isMain, from, to, amount, memo) {
		const token = isMain ? 'iost' : storage.get(TOKEN);
		blockchain.callWithAuth('token.iost', 'transfer', [token, from, to, amount, memo]);
		const balance = JSON.parse(storage.get(BALANNCE));
		const key = isMain ? 'iost' : 'token';
		const base = balance[key] ? balance[key] : 0;
		// TODO 加法和减法可能不是安全的
		balance[key] = (base + (to === this._getSelf() ? 1 : from === this._getSelf() ? -1 : 0) * amount).toFixed(8) * 1;
		storage.put(BALANNCE, JSON.stringify(balance));
	}
}

module.exports = UniswapExchange;
