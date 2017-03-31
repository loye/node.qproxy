const net = require('net');
const util = require('util');
const stream = require('stream');
const crypto = require('crypto');
const Proxy = require('proxy.stream').Proxy;

let port = 1443;
let password = '1qaz@WSX';

net
  .createServer(conn => {
    conn
      .on('error', err => {
        conn.end();
        console.error('connection error:', err);
      })
      .pipe(new Decryption(password))
      .pipe(new Proxy())
      .pipe(new Encryption(password))
      .pipe(conn);
  })
  .on('error', err => console.error('server error:', err.message))
  .listen(port, () => console.info('start listening on port: ' + port));


function Encryption(key) {
  if (!(this instanceof Encryption)) return new Encryption(key);
  stream.Duplex.call(this);
  this.seed = crypto.createHash('sha512').update(key).digest(); //length: 64
  this.offset = 0;
  this.once('finish', function () {
    this.push(null);
  });
}
util.inherits(Encryption, stream.Duplex);

(function (proto) {
  proto._write = function (chunk, encoding, callback) {
    var data = typeof chunk === 'string' ? new Buffer(chunk, encoding) : chunk;
    for (var i = 0, len = data.length, os = this.offset & 63, seed = this.seed; i < len; i++, os++) {
      var step = (os & 7) + ((os & 8) == 0 ? -8 : 1);
      data[i] = ~((data[i] + step * seed[os & 63]) & 255);
    }
    this.offset += data.length;
    this.push(data);
    callback.call(this);
  };

  proto._read = function (n) {
  };
})(Encryption.prototype);


function Decryption(key) {
  if (!(this instanceof Decryption)) return new Decryption(key);
  stream.Duplex.call(this);
  this.seed = crypto.createHash('sha512').update(key).digest(); //length: 64
  this.offset = 0;
  this.once('finish', function () {
    this.push(null);
  });
}
util.inherits(Decryption, stream.Duplex);

(function (proto) {
  proto._write = function (chunk, encoding, callback) {
    var data = typeof chunk === 'string' ? new Buffer(chunk, encoding) : chunk;
    for (var i = 0, len = data.length, os = this.offset & 63, seed = this.seed; i < len; i++, os++) {
      var step = (os & 7) + ((os & 8) == 0 ? -8 : 1);
      data[i] = (~data[i] - step * seed[os & 63]) & 255;
    }
    this.offset += data.length;
    this.push(data);
    callback.call(this);
  };

  proto._read = function (n) {
  };
})(Decryption.prototype);
