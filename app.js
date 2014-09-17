// Author       : Lijian Qiu
// Email        : loye.qiu@gmail.com
// Description  : proxy local server


var net = require('net');

var wss = require('ws.stream');

var url = 'ws://localhost:1337'; //remote server location
var port = 2000;  //local listening port

//test url
wss.connect(url).on('connect', function (s) {
  console.log('test url: ' + url + ' -> ' + (s.connected ? 'success' : 'failed'));
  s.close();
}).on('error', function (err) {
  console.log(err);
});

net.createServer(function (socket) {
  wss.connect(url).on('connect', function (s) {
    socket.pipe(s).pipe(socket);
  }).on('error', function (err) {
    console.log(err);
  });
}).listen(port);

console.log('start listening on port ' + port);
console.log('remote url: ' + url);

process.on('uncaughtException', function (err) {
  console.log('[Error catched by process] ' + err);
});
