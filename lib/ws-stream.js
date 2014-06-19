var util = require('util'),
    stream = require('stream'),
    WebSocket = require('ws');

function WebSocketStream(address, protocols, options) {
    stream.Duplex.call(this);

    this.connected = false;

    var self = this;
    if (typeof address === 'string') {
        this._websocket = new WebSocket(address, protocols, options).on('open', onopen.bind(this));
    } else {
        this._websocket = address;
        onopen.call(this);
    }
};
util.inherits(WebSocketStream, stream.Duplex);

function onopen() {
    var self = this;
    this._websocket.on('close', function () {
        self.connected = false;
        self.emit('disconnect');
    }).on('error', function (err) {
        self.emit('error', err);
    });
    this.on('finish', function () {
        self.disconnect();
    }).on('error', function (err) {
        //console.log(err);
    });
    this.connected = true;
    this.emit('connect', this);
};

(function (proto) {
    proto.disconnect = function () {
        this.connected = false;
        this._websocket.close();
    };

    proto._write = function (chunk, encoding, callback) {
        var data = typeof chunk === 'string' ? new Buffer(chunk, encoding) : chunk;
        var self = this;
        if (!this.connected) {
            this.once('connect', function () {
                self._websocket.send(data, { binary: true }, callback);
            });
        } else {
            self._websocket.send(data, { binary: true }, callback);
        }
    };

    proto._read = function (n) {
        var self = this;
        if (!this._reading) {
            this._reading = true;
            this._websocket.on('message', function (data, flags) {
                self.push(data);
            }).on('close', function () {
                self.push(null);
            });
        }
    };

})(WebSocketStream.prototype);

exports.WebSocketStream = WebSocketStream;

exports.connect = function (address, protocols, options) {
    return new WebSocketStream(address, protocols, options);
};

exports.listen = function (options, onconnect) {
    new WebSocket.Server(options).on('connection', function (ws) {
        onconnect.call(null, new WebSocketStream(ws));
    });
};

// test
if (require.main === module) {
    listen({ port: 1337 }, function (s) {
        s.pipe(require('fs').createWriteStream('.\\1.dat'));
    });
}
