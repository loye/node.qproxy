var util = require('util'),
    stream = require('stream'),
    WebSocket = require('ws');

var WebSocketStream = (function () {
    function _(address, protocols, options) {
        stream.Duplex.call(this);

        this.status = { sent: 0, received: 0 };

        if (typeof address === 'string') {
            this._socket = new WebSocket(address, protocols, options).on('error', onerror.bind(this)).on('open', onopen.bind(this));
        } else {
            this._socket = address.on('error', onerror.bind(this));
            onopen.call(this);
        }
    };
    util.inherits(_, stream.Duplex);

    function onopen() {
        var self = this;
        this._socket.on('message', function (data, flags) {
            self.push(data);
            self.status.received += data.length;
        }).on('close', function () {
            self.connected = false;
            self.push(null);
            self.emit('close', !!self.status.closing);
        });

        this.on('finish', function () {
            self.close();
        }).on('error', function (err) { });

        this.connected = true;
        this.emit('connection', this);
    };

    function onerror(err) {
        this.emit('error', err);
    };

    (function (proto) {
        proto._write = function (chunk, encoding, callback) {
            var self = this;
            if (!this.connected) {
                this.once('connection', function () {
                    self._write(chunk, encoding, callback);
                });
            } else {
                var data = typeof chunk === 'string' ? new Buffer(chunk, encoding) : chunk;
                this._socket.send(data, { binary: true }, function (err) {
                    if (!err)
                        self.status.sent += data.length;
                    typeof callback === 'function' && callback.call(null, err);
                });
            }
        };

        proto._read = function (n) { };

        proto.close = function () {
            this.status.closing = true;
            this._socket.close();
            return this;
        };

    })(_.prototype);

    return _;
})();


module.exports.WebSocketStream = WebSocketStream;

module.exports.connect = connent = function (address, protocols, options) {
    return new WebSocketStream(address, protocols, options);
};

module.exports.listen = listen = function (options, onconnection) {
    var server = new WebSocket.Server(options);
    if (typeof onconnection === 'function') {
        server.on('connection', function (ws) {
            onconnection.call(null, new WebSocketStream(ws));
        });
    }
    return server;
};

