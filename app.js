var net = require('net'),
    wss = require('./lib/ws-stream');

var url = 'http://localhost:1337';
var port = 2000;

net.createServer(function (s) {
    wss.connect(url).on('connect', function (t) {
        s.pipe(t).pipe(s);
    });
}).listen(port);

console.log('start listening on port ' + port);
console.log('remote url: ' + url);

process.on('uncaughtException', function (err) {
    console.log('[Error catched by process] ' + err);
});
