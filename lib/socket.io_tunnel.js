var net = require('net'),
    util = require('util'),
    events = require('events'),
    stream = require('stream'),
    crypto = require('crypto'),
    ios = require('socket.io'),
    ioc = require('socket.io-client');

/*
    Tunnel
*/
function Tunnel(id) {
    stream.Duplex.call(this);

    this.connected = false;
    this.disconnected = false;
    this.id = id || crypto.createHash('sha1').update(Math.abs(Math.random() * Math.random() * Date.now() | 0).toString()).digest('hex');

    this.once('_connect', function () {
        this.connected = true;
        process.nextTick(function () { this.emit('connect', this); }.bind(this));
    }).once('_disconnect', function () {
        this.connected = false;
        this.disconnected = true;
        process.nextTick(function () { this.emit('disconnect'); }.bind(this));
    }).once('finish', function () {
        this.disconnect();
    });
};
util.inherits(Tunnel, stream.Duplex);

(function (proto) {
    proto.connect = function (uri, opts) {
        var self = this;
        var socket = ioc(uri, opts).on('connect', function () {
            socket.emit('tunnel.connect', { id: self.id });
            onconnect.call(self, socket);
        });
        if (opts.forceNew || false === opts.multiplex) {
            this.once('_disconnect', function () {
                socket.emit('disconnect', true);
            });
        }
        return this;
    };

    proto.disconnect = function () {
        if (!this.disconnected) {
            this.emit('_disconnect.remote', function () {
                this.emit('_disconnect');
            }.bind(this));
        }
        return this;
    };

    proto._write = function (chunk, encoding, callback) {
        var data = typeof chunk === 'string' ? new Buffer(chunk, encoding) : chunk;
        var self = this;
        if (!this.connected) {
            this.once('_connect', function () {
                self.emit('_data.write', data);
                callback.call(self);
            });
        } else {
            this.emit('_data.write', data);
            callback.call(self);
        }
    };

    proto._read = function (n) {
        var self = this;
        if (!this.connected) {
            this.once('_connect', this._read.bind(this, n));
        } else if (!this._reading) {
            this._reading = true;
            this.on('_data.read', function (data) {
                self.push(data);
            }).once('_disconnect', function () {
                self.push(null);
            });
        }
    };

})(Tunnel.prototype);


/*
    TunnelServer
*/
function TunnelServer() {
    events.EventEmitter.call(this);
};
util.inherits(TunnelServer, events.EventEmitter);

function onconnect(socket) {
    var self = this;
    socket.on('tunnel[' + self.id + ']' + '.data', function (data) {
        self.emit('_data.read', data);
    }).once('tunnel[' + self.id + ']' + '.disconnect', function (callback) {
        self.removeAllListeners('_disconnect.remote').emit('_disconnect');
        callback();
    }).once('disconnect', function () {
        self.emit('_disconnect');
    });

    self.on('_data.write', function (data) {
        socket.emit('tunnel[' + self.id + ']' + '.data', data);
    }).once('_disconnect.remote', function (callback) {
        socket.emit('tunnel[' + self.id + ']' + '.disconnect', callback);
    }).emit('_connect');

    return this;
};

//server
function attach(io) {
    var server = new TunnelServer();

    server.io = io.on('connect', function (socket) {
        socket.on('tunnel.connect', function (profile) {
            server.emit('connect', onconnect.call(new Tunnel(profile.id), socket));
        });
    });

    return server;
};

//server
function listen(port) {
    return attach(typeof port === 'object' ? port : ios(port));
};

//client
function connect(uri, opts) {
    return new Tunnel().connect(uri, opts);
};


//exports
exports.Tunnel = Tunnel;
exports.attach = attach;
exports.listen = listen;
exports.connect = connect;


// test
if (require.main === module) {
    listen(8080).on('connect', function (t) {
        console.log(t.id);
        t.pipe(t);
        t.on('disconnect', function () {
            console.log('disconnected');
        });
    });
}
