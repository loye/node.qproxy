var crypto = require('crypto');

function SimpleEncryptionProvider(key) {
    this.seed = crypto.createHash('md5')
        .update(!key ? '!1@2#3$4%5^6&7*8' : key)
        .digest();
};

(function (proto) {
    proto.encrypt = function (src, offset, length, globalOffset) {
        offset = offset === undefined ? 0 : offset;
        length = length === undefined ? src.length - offset : length;
        globalOffset = globalOffset === undefined ? 0 : globalOffset;
        for (var i = offset, so = (globalOffset ? globalOffset : 0) % 16; i < length + offset; i++, so++) {
            var steps = (so & 7) + ((so & 8) == 0 ? -8 : 1);
            src[i] = ~((src[i] + steps * this.seed[so & 15]) & 255);
        }
        return length - offset;
    };

    proto.decrypt = function (src, offset, length, globalOffset) {
        offset = offset === undefined ? 0 : offset;
        length = length === undefined ? src.length - offset : length;
        globalOffset = globalOffset === undefined ? 0 : globalOffset;
        for (var i = offset, so = globalOffset % 16; i < length + offset; i++, so++) {
            var steps = (so & 7) + ((so & 8) == 0 ? -8 : 1);
            src[i] = ((~src[i] - steps * this.seed[so & 15]) & 255);
        }
        return length - offset;
    };
})(SimpleEncryptionProvider.prototype);


//exports
exports.createSimpleEncryptionProvider = function (key) {
    return new SimpleEncryptionProvider(key);
};

//test
if (require.main === module) {
    var p = new SimpleEncryptionProvider();
    var src = new Buffer('abcdABCD1234');
    var ec = p.encrypt(src);
    var dc = p.decrypt(src);
    console.log(src.toString());
}
