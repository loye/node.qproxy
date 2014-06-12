var net = require('net'),
    io = require('socket.io_tunnel');

net.createServer(function (s) {
    io.connect('http://localhost:1337', { forceNew: true }).on('connect', function (t) {
        s.pipe(t).pipe(s);
    });
}).listen(2000);


process.on('uncaughtException', function (err) {
    console.log('[Error catched by process]' + err);
});
