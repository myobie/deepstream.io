var HttpMock = function(){};

HttpMock.prototype.createServer = function() {
	return {
		listen: function() {},
		close: function() {},
		on: function() {}
	}
};

module.exports = HttpMock;