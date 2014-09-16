// Author       : Lijian Qiu
// Email        : loye.qiu@gmail.com
// Description  : proxy remote server


var http = require('http');

var wss = require('ws.stream');
var Proxy = require('proxy.stream').Proxy;

var port = process.env.port || 1337;

var server = http.createServer(function (req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('I\'m working.\r\n');
}).listen(port);

wss.listen({ server: server }, function (s) {
  s.pipe(new Proxy({ type: 'direct' })).pipe(s);
});

process.on('uncaughtException', function (err) {
  console.log('[Error catched by process] ' + err);
});
