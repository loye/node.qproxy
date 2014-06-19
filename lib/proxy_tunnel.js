var net = require('net'),
    util = require('util'),
    stream = require('stream'),
    events = require("events"),
    HttpParser = require('./http_parser').HttpParser;

/*
    ProxyTunnel
*/
function ProxyTunnel(proxy) {
    stream.Duplex.call(this);

    this.connected = false;
    this.proxy = proxy;

    this.on('error', function (err) {
        this.push(null);
        this.socket && this.socket.end();
    });
};
util.inherits(ProxyTunnel, stream.Duplex);

//prototype
(function (proto) {

    proto._write = function (chunk, encoding, callback) {
        if (this.socket) {
            this.socket.write(chunk, encoding, callback);
        } else {
            var data = typeof chunk === 'string' ? new Buffer(chunk, encoding) : chunk;
            (this.connector || (this.connector = new Connector(this, onconnect)));
            this.connector.once('connect_callback', callback.bind(this));
            this.socket = this.connector.append(data).connect(this.proxy);
        }
    };

    proto._read = function (n) {
        var self = this;
        if (!this._reading) {
            this._reading = true;
            this.on('_data.read', function (data) {
                self.push(data);
            });
        }
    };

    function onconnect(socket) {
        var self = this;
        socket.on('data', function (data) {
            self.push(data);
        }).on('close', function () {
            self.push(null);
        });

        this.connected = true;

        this.once('finish', function () {
            this.socket && this.socket.end();
        }).emit('connect', socket);
    };

})(ProxyTunnel.prototype);


/*
    Connector
    Socks4:
        |VER{1}4|ATYP{1}1|DST.PORT{2}|DST.ADDR{4}|USERID{}|END{1}0|[?(Socks4a)DST.ADDR=0,0,0,1?DST.HOST{}|END{1}0]
        |REP{1}0|PROTOCOL{1}90|DST.PORT{2}|DST.ADDR{4}|
    Socks5:
        |VER{1}5|NMETHODS{1}|METHODS{NMETHODS}|
        |VER{1}5|METHOD{1}|
        |VER{1}5|CMD{1}[1(TCP)|3(UDP)]|RSV{1}0|ATYP{1}[1(IPv4)/3(HOST)/4(IPv6)]|[DST.ADDR{4}/DST.NHOST{1}|DST.HOST{DST.NHOST}]|DST.PORT{2}|
        |VER{1}5|REP{1}0|RSV{1}0|ATYP{1}1|BND.ADDR{4}|BIND.PORT{2}| : 5, 0, 0, 1, 0, 0, 0, 0, 0, 0
*/
function Connector(tunnel, onconnect) {
    events.EventEmitter.call(this);

    this._tunnel = tunnel;

    this.once('result', function (success, socket, err) {
        if (success) {
            this.emit('preready', socket);
            this.emit('ready', socket);
        } else {
            this.emit('prefailed', err);
            this.emit('failed', err);
        }
        this.emit('connect_callback', err);
    }).once('ready', function (socket) {
        onconnect.call(this._tunnel, socket);
    }).once('failed', function (err) {
        this._tunnel.emit('error', err);
    });
};
util.inherits(Connector, events.EventEmitter);

//prototype
(function (proto) {
    var HTTP_CONNECT_RESPONSE_200 = new Buffer('HTTP/1.1 200 Connection Established\r\nConnection: close\r\n\r\n', 'ascii');
    var HTTP_CONNECT_RESPONSE_502 = new Buffer('HTTP/1.1 502 Connection Failed\r\nConnection: close\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n', 'ascii');

    proto.connect = function (proxy) {
        this.proxy = proxy ? proxy : { type: 'direct' };
        var self = this, remoteSocket;
        var endpoint = this.endpoint = accept.call(this);

        if (endpoint) {
            switch (this.proxy.type) {
                case 'socks4':
                    remoteSocket = connectSocks4.call(this);
                    break;
                case 'socks5':
                    remoteSocket = connectSocks5.call(this);
                    break;
                case 'http':
                    remoteSocket = connectHttp.call(this);
                    break;
                case 'direct':
                default:
                    remoteSocket = net.connect(endpoint.port, endpoint.host, function () {
                        self.emit('result', true, remoteSocket);
                    }).on('error', function () {
                        self.emit('result', false, remoteSocket, 'Connection Failed: [' + endpoint.host + ':' + endpoint.port + ']');
                    });
                    break;
            }
        }
        if (!remoteSocket) {
            this.emit('connect_callback');
        }
        return remoteSocket;
    };

    proto.append = function (data) {
        this.buffer = this.buffer ? Buffer.concat([this.buffer, data]) : data;
        return this;
    };

    proto.push = function (data) {
        this._tunnel.emit('_data.read', data);
        return this;
    };

    function accept() {
        var buffer = this.buffer;
        var endpoint;
        if (buffer[0] === 0x04) {
            //socks4
            endpoint = acceptSocks4.call(this);
        } else if (buffer[0] === 0x05) {
            //socks5
            endpoint = acceptSocks5.call(this);
        } else if (buffer[0] > 0x40 && buffer[0] < 0x5B) {
            //http
            endpoint = acceptHttp.call(this);
        }
        return endpoint;
    }

    function acceptSocks4() {
        var buffer = this.buffer;
        var host, ip, port = (buffer[2] << 8) + buffer[3], index;
        //skip USERID
        for (index = 8; index < buffer.length && buffer[index] !== 0; index++);
        // host (Socks4a)
        if (buffer[4] === 0 && buffer[5] === 0 && buffer[6] === 0 && buffer[7] > 0) {
            for (i = ++index; i < buffer.length; i++) {
                if (buffer[i] === 0) {
                    host = buffer.toString('ascii', index, i);
                    break;
                }
            }
        } else {
            host = ip = buffer[4] + '.' + buffer[5] + '.' + buffer[6] + '.' + buffer[7];
        }
        //success
        this.push(new Buffer([0, 90, buffer[2], buffer[3], buffer[4], buffer[5], buffer[6], buffer[7]]));
        return { type: 'socks4', host: host, ip: ip, port: port };
    }

    function acceptSocks5() {
        var buffer = this.buffer;

        if (this.socks5) {
            var host, ip, port, buffer = buffer.slice(this.socks5.index);
            switch (buffer[3]) {
                case 1: //ipv4
                    host = ip = buffer[4] + '.' + buffer[5] + '.' + buffer[6] + '.' + buffer[7];
                    port = (buffer[8] << 8) + buffer[9];
                    //success
                    this.push(new Buffer([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
                    break;
                case 3: //host
                    host = buffer.toString('ascii', 5, 5 + buffer[4]);
                    port = (buffer[5 + buffer[4]] << 8) + buffer[5 + buffer[4] + 1];
                    //success
                    this.push(new Buffer([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
                    break;
                case 4: //ipv6 not supported
                default:
                    //address type not supported
                    this.push(new Buffer([5, 8, 0, 1, 0, 0, 0, 0, 0, 0]));
            }
            return port ? { type: 'socks5', host: host, ip: ip, port: port } : null;
        } else {
            var hasAnonymousMethod;
            for (var i = 2; i < buffer[1] + 2 && i < buffer.length; i++) {
                if (buffer[i] === 0) {
                    hasAnonymousMethod = true;
                    break;
                }
            }
            if (hasAnonymousMethod) {
                this.socks5 = { index: buffer.length };
                //anonymous authentication
                this.push(new Buffer([5, 0]));
            }
            else {
                //authentication not supported
                this.push(new Buffer([5, 0xFF]));
            }
        }
        return null;
    }

    function acceptHttp() {
        var buffer = this.buffer;
        var header = new HttpParser().parseHeader(buffer);

        if (header) {
            if (header.method === 'CONNECT') {
                this.once('preready', function (s) {
                    this.push(HTTP_CONNECT_RESPONSE_200);
                });
            } else {
                this.once('preready', function (s) {
                    s.write(buffer);
                });
            }
            this.once('prefailed', function (err) {
                this.push(HTTP_CONNECT_RESPONSE_502);
                this.push(err);
            });
            return { type: 'http', host: header.host, port: header.port };
        }
    }

    function connectSocks4() {
        var self = this, endpoint = self.endpoint, proxy = self.proxy;
        var buf,
            ip = IP.parse(endpoint.host),
            requestBuffer = new Buffer(ip ? 9 : endpoint.host.length + 10);
        requestBuffer[0] = 4;
        requestBuffer[1] = 1;
        requestBuffer[2] = endpoint.port >> 8;
        requestBuffer[3] = endpoint.port & 0xFF;
        (ip ? ip.binary : new Buffer([0, 0, 0, 1])).copy(requestBuffer, 4, 0, 4);
        requestBuffer[8] = 0;
        if (!ip) {
            new Buffer(endpoint.host, 'ascii').copy(requestBuffer, 9, 0, endpoint.host.length);
            requestBuffer[requestBuffer.length - 1] = 0;
        }

        var ondata = function (data) {
            buf = buf ? Buffer.concat([buf, data]) : data;
            if (buf.length >= 8) {
                remoteSocket.removeListener('data', ondata);
                self.emit('result', true, this);
            }
        };
        var remoteSocket = net.connect(proxy.port, proxy.host, function () {
            this.write(requestBuffer);
        }).on('data', ondata).on('error', function () {
            self.emit('result', false, this, 'Connection Failed');
        });
        return remoteSocket;
    }

    function connectSocks5() {
        var self = this, endpoint = self.endpoint, proxy = self.proxy;
        var buf,
            ip = IP.parse(endpoint.host),
            step = 1,
            requestBuffer;
        var ondata = function (data) {
            buf = buf ? Buffer.concat([buf, data]) : data;
            if (step === 1) {
                if (buf.length >= 2 && buf[1] === 0) {
                    requestBuffer = new Buffer(ip ? 10 : endpoint.host.length + 7);
                    requestBuffer[0] = 5;
                    requestBuffer[1] = 1;
                    requestBuffer[2] = 0;
                    requestBuffer[3] = ip ? 1 : 3;
                    if (ip) {
                        ip.binary.copy(requestBuffer, 4, 0, 4);
                    } else {
                        requestBuffer[4] = endpoint.host.length;
                        new Buffer(endpoint.host, 'ascii').copy(requestBuffer, 5, 0, endpoint.host.length);
                    }
                    requestBuffer[requestBuffer.length - 2] = endpoint.port >> 8;
                    requestBuffer[requestBuffer.length - 1] = endpoint.port & 0xFF;
                    this.write(requestBuffer);
                    buf = null;
                    step++;
                }
            } else if (step === 2) {
                if (buf.length >= 10) {
                    remoteSocket.removeListener('data', ondata);
                    if (buf[1] === 0) {
                        self.emit('result', true, this);
                    } else {
                        self.emit('result', false, this, 'Connection Failed');
                    }
                }
            }
        };
        var remoteSocket = net.connect(proxy.port, proxy.host, function () {
            this.write(new Buffer([5, 1, 0]));
        }).on('data', ondata).on('error', function () {
            self.emit('result', false, this, 'Connection Failed');
        });
        return remoteSocket;
    }

    function connectHttp() {
        var self = this, endpoint = self.endpoint, proxy = self.proxy;
        var buf, response;
        var ondata = function (data) {
            buf = buf ? Buffer.concat([buf, data]) : data;
            if (response = new HttpParser().parse(buf)) {
                remoteSocket.removeListener('data', ondata);
                if (response.header.code === 200) {
                    self.emit('result', true, this);
                } else {
                    self.emit('result', false, this, response.header.startline);
                }
            }
        };
        var remoteSocket = net.connect(proxy.port, proxy.host, function () {
            this.write(new Buffer('CONNECT ' + endpoint.host + ':' + endpoint.port + ' HTTP/1.1\r\nHost: ' + endpoint.host + ':' + endpoint.port + '\r\n\r\n', 'ascii'));
        }).on('data', ondata).on('error', function () {
            self.emit('result', false, this, 'Connection Failed');
        });
        return remoteSocket;
    }

})(Connector.prototype);


/*
    IP
*/
function IP(buffer, start, end) {
    !Array.isArray(buffer) || (buffer = new Buffer(buffer));
    if (Buffer.isBuffer(buffer)) {
        start || (start = 0);
        end || (end = buffer.length);
        if (end - start === 4) {
            this.version = 4;
        } else if (end - start === 16) {
            this.version = 6;
        } else {
            throw 'parameters incorrect!';
        }
        this.binary = buffer.slice(start, end);
    }
    else {
        throw 'parameters incorrect!';
    }
};

IP.parse = (function () {
    return function (addr) {
        var isIP = net.isIP(addr);
        if (isIP === 4) {
            var arr = addr.split('.');
            if (arr.length === 4 && arr[0] < 256 && arr[1] < 256 && arr[2] < 256 && arr[3] < 256) {
                return new IP([+arr[0], +arr[1], +arr[2], +arr[3]]);
            }
        } else {
            return null;
        }
    };
})();

(function (proto) {
    proto.toString = function () {
        if (this.version === 4) {
            return this.binary[0] + '.' + this.binary[1] + '.' + this.binary[2] + '.' + this.binary[3];
        } else {
            return null;
        }
    };
})(IP.prototype);


//exports
exports.ProxyTunnel = ProxyTunnel;


//test
if (require.main === module) {
    net.createServer(function (s) {
        s.pipe(new ProxyTunnel({ type: 'direct' })).pipe(s);
    }).listen(2000);
    net.createServer(function (s) {
        s.pipe(new ProxyTunnel({ type: 'socks5', host: 'localhost', port: 2000 })).pipe(s);
    }).listen(8000);
    console.log('start listening');
}

